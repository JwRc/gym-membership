/**
 * Planos (modalidades + turmas automáticas) e graduação livre, de ponta a ponta.
 *
 * Precisa de um Postgres com as migrations aplicadas (DATABASE_URL/DIRECT_URL)
 * e da API compilada: `npm run test:e2e` faz o build antes.
 */
import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createAcademy } from '../src/modules/tenant/create-academy';
import { syncCatalog } from '../src/modules/disciplines/catalog-sync';

process.env.JWT_SECRET ??= 'e2e-secret';
if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL (e DIRECT_URL) para rodar os testes e2e.');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('../dist/app.module');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { configureApp } = require('../dist/app.setup');

const run = Date.now().toString(36);
const PASSWORD = 'senha-e2e-123';
const prisma = new PrismaClient();
let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let h: { Authorization: string };
let tenantId: string;
let bjj: string;
let mt: string;
let n = 0;

const student = (extra: object) =>
  http.post('/api/students').set(h).send({
    name: `Aluno ${++n}`, birthDate: '2000-01-01', email: `p${n}-${run}@e2e.test`, monthlyFee: 100, dueDay: 5, consent: true, ...extra,
  });
const classes = (id: string) => prisma.enrollment.findMany({ where: { studentId: id } }).then((r) => r.map((e) => e.classGroupId).sort());
const ranks = (id: string) => prisma.studentRank.findMany({ where: { studentId: id } }).then((r) => r.map((x) => x.disciplineId).sort());
const turma = async (name: string, disciplineId: string, capacity: number) =>
  (await http.post('/api/classes').set(h).send({ name, disciplineId, capacity }).expect(201)).body.id as string;

before(async () => {
  await syncCatalog(prisma);
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(mod.createNestApplication<NestExpressApplication>());
  await app.init();
  http = request(app.getHttpServer());
  const email = `planos-${run}@e2e.test`;
  const r = await createAcademy(prisma, { academyName: `Planos ${run}`, adminName: 'Admin', adminEmail: email, password: PASSWORD, disciplines: ['bjj', 'mt'] });
  tenantId = r.tenant.id;
  const login = await http.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  h = { Authorization: `Bearer ${login.body.token}` };
  const disc = (await http.get('/api/disciplines').set(h).expect(200)).body.disciplines as { id: string; name: string }[];
  bjj = disc.find((d) => d.name === 'Jiu-jitsu')!.id;
  mt = disc.find((d) => d.name === 'Muay Thai')!.id;
});

after(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@e2e.test` } } });
  await app?.close();
  await prisma.$disconnect();
});

test('plano matricula nas modalidades e turmas; lotada vira aviso; troca de plano tira das turmas antigas', async () => {
  const bjjNoite = await turma('BJJ Noite', bjj, 1);
  const mtNoite = await turma('MT Noite', mt, 10);
  const bjjManha = await turma('BJJ Manhã', bjj, 10);

  // turma de outra modalidade fora do plano é recusada
  await http.post('/api/plans').set(h).send({ name: 'Errado', price: 1, disciplineIds: [bjj], classGroupIds: [mtNoite] }).expect(400);

  const combo = (await http.post('/api/plans').set(h).send({ name: 'Combo', price: 350, disciplineIds: [bjj, mt], classGroupIds: [bjjNoite, mtNoite] }).expect(201)).body.id;
  const manha = (await http.post('/api/plans').set(h).send({ name: 'Manhã', price: 200, disciplineIds: [bjj], classGroupIds: [bjjManha] }).expect(201)).body.id;

  // sem modalidade no formulário: vêm do plano
  const a = await student({ planId: combo }).expect(201);
  assert.deepEqual(a.body.warnings, []);
  assert.deepEqual(await ranks(a.body.id), [bjj, mt].sort());
  assert.deepEqual(await classes(a.body.id), [bjjNoite, mtNoite].sort());

  // BJJ Noite (capacidade 1) lotou: o segundo aluno entra só na outra
  const b = await student({ planId: combo }).expect(201);
  assert.equal(b.body.warnings.length, 1);
  assert.match(b.body.warnings[0], /BJJ Noite/);
  assert.deepEqual(await classes(b.body.id), [mtNoite]);

  // troca para o plano Manhã: sai das turmas do Combo, mantém a graduação de Muay Thai
  const up = await http.patch(`/api/students/${a.body.id}`).set(h).send({ planId: manha }).expect(200);
  assert.deepEqual(up.body.warnings, []);
  assert.deepEqual(await classes(a.body.id), [bjjManha]);
  assert.deepEqual(await ranks(a.body.id), [bjj, mt].sort());

  // sem plano e sem modalidade: recusado
  await student({}).expect(400);

  // plano arquivado não pode ser escolhido nem excluído com alunos
  await http.post(`/api/plans/${combo}/archive`).set(h).expect(201);
  await student({ planId: combo }).expect(400);
  await http.delete(`/api/plans/${combo}`).set(h).expect(409);
  await http.post(`/api/plans/${combo}/restore`).set(h).expect(201);

  const list = (await http.get('/api/plans').set(h).expect(200)).body.plans;
  const c = list.find((p: { id: string }) => p.id === combo);
  assert.equal(c.studentCount, 1);
  assert.equal(c.disciplines.length, 2);
});

test('editar plano com "aplicar aos atuais" só adiciona', async () => {
  const t1 = await turma('BJJ Kids', bjj, 10);
  const t2 = await turma('MT Kids', mt, 10);
  const plan = (await http.post('/api/plans').set(h).send({ name: 'Kids', price: 150, disciplineIds: [bjj], classGroupIds: [t1] }).expect(201)).body.id;
  const s = await student({ planId: plan }).expect(201);
  assert.deepEqual(await ranks(s.body.id), [bjj]);

  // sem aplicar: nada muda para quem já está no plano
  await http.patch(`/api/plans/${plan}`).set(h).send({ name: 'Kids', price: 150, disciplineIds: [bjj, mt], classGroupIds: [t1, t2] }).expect(200);
  assert.deepEqual(await ranks(s.body.id), [bjj]);

  // aplicando (tira BJJ Kids do plano e põe de volta MT Kids): adiciona e não remove
  await http.patch(`/api/plans/${plan}`).set(h).send({ name: 'Kids', price: 150, disciplineIds: [bjj], classGroupIds: [t1] }).expect(200);
  const r = await http.patch(`/api/plans/${plan}`).set(h).send({ name: 'Kids', price: 150, disciplineIds: [bjj, mt], classGroupIds: [t2], applyToCurrent: true }).expect(200);
  assert.equal(r.body.affected, 1);
  assert.deepEqual(await ranks(s.body.id), [bjj, mt].sort());
  assert.deepEqual(await classes(s.body.id), [t1, t2].sort());
});

test('graduação livre: correção não mexe no histórico; graduação registra; remover modalidade', async () => {
  const s = (await student({ ranks: [{ disciplineId: bjj, levelOrder: 1, degree: 2 }, { disciplineId: mt, levelOrder: 0 }] }).expect(201)).body.id;
  const before = await prisma.promotion.count({ where: { studentId: s, disciplineId: bjj } });

  await http.put('/api/graduation/rank').set(h).send({ studentId: s, disciplineId: bjj, levelOrder: 0, degree: 4, mode: 'correction', levelSince: '2024-03-01' }).expect(200);
  let r = await prisma.studentRank.findFirstOrThrow({ where: { studentId: s, disciplineId: bjj } });
  assert.equal(r.levelOrder, 0);
  assert.equal(r.degree, 4);
  assert.equal(r.levelSince.toISOString().slice(0, 10), '2024-03-01');
  assert.equal(await prisma.promotion.count({ where: { studentId: s, disciplineId: bjj } }), before);

  await http.put('/api/graduation/rank').set(h).send({ studentId: s, disciplineId: bjj, levelOrder: 1, degree: 9, mode: 'promotion' }).expect(400);
  await http.put('/api/graduation/rank').set(h).send({ studentId: s, disciplineId: bjj, levelOrder: 2, degree: 0, mode: 'promotion', date: '2026-11-01' }).expect(200);
  r = await prisma.studentRank.findFirstOrThrow({ where: { studentId: s, disciplineId: bjj } });
  assert.equal(r.levelOrder, 2);
  const hist = await prisma.promotion.findMany({ where: { studentId: s, disciplineId: bjj }, orderBy: { date: 'desc' } });
  assert.equal(hist.length, before + 1);

  // histórico: apagar um registro
  await http.delete(`/api/graduation/history/${hist[0].id}`).set(h).expect(200);
  assert.equal(await prisma.promotion.count({ where: { studentId: s, disciplineId: bjj } }), before);

  // remover modalidade; a última não pode
  await http.delete(`/api/graduation/rank?studentId=${s}&disciplineId=${mt}`).set(h).expect(200);
  assert.deepEqual(await ranks(s), [bjj]);
  await http.delete(`/api/graduation/rank?studentId=${s}&disciplineId=${bjj}`).set(h).expect(400);
});
