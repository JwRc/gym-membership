/**
 * Isolamento entre academias (multi-tenant): um usuário da academia A não pode
 * ler nem alterar nada da academia B, mesmo conhecendo os ids.
 *
 * Precisa de um Postgres com as migrations aplicadas (DATABASE_URL/DIRECT_URL)
 * e da API compilada: `npm run test:e2e` faz o build antes.
 */
import 'reflect-metadata';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createAcademy } from '../src/modules/tenant/create-academy';
import { syncCatalog } from '../src/modules/disciplines/catalog-sync';

process.env.JWT_SECRET ??= 'e2e-secret';
if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL (e DIRECT_URL) para rodar os testes e2e.');

// a API é carregada do build (o tsx não emite os metadados de injeção do Nest)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('../dist/app.module');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { configureApp } = require('../dist/app.setup');

const run = Date.now().toString(36);
const PASSWORD = 'senha-e2e-123';
const prisma = new PrismaClient();
let app: NestExpressApplication;
let http: ReturnType<typeof request>;

type Ids = {
  token: string; tenantId: string; disciplineId: string; studentId: string; invoiceId: string; txId: string;
  productId: string; classId: string; slotId: string; planId: string;
};
let A: Ids;
let B: Ids;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Cria uma academia e popula pela própria API (como um usuário faria). */
async function seed(label: string): Promise<Ids> {
  const email = `${label}-${run}@e2e.test`;
  const { tenant } = await createAcademy(prisma, { academyName: `Academia ${label} ${run}`, adminName: `Admin ${label}`, adminEmail: email, password: PASSWORD, disciplines: ['bjj'] });
  const login = await http.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  const token: string = login.body.token;
  const h = auth(token);
  const disc = await http.get('/api/disciplines').set(h).expect(200);
  const disciplineId: string = disc.body.disciplines[0].id;
  const st = await http.post('/api/students').set(h).send({
    name: `Aluno ${label}`, birthDate: '2010-01-01', email: `aluno-${label}-${run}@e2e.test`, monthlyFee: 100, dueDay: 5, consent: true,
    ranks: [{ disciplineId, levelOrder: 0 }],
  }).expect(201);
  const studentId: string = st.body.id;
  const inv = await http.get(`/api/students/${studentId}/invoices`).set(h).expect(200);
  const invoiceId: string = inv.body.rows[0].id;
  const tx = await http.post('/api/finance/transactions').set(h).send({ type: 'EXPENSE', description: `Aluguel ${label}`, amount: 50, date: '2026-01-10', category: 'Aluguel', status: 'PENDING' }).expect(201);
  const pr = await http.post('/api/store/products').set(h).send({ name: `Kimono ${label}`, category: 'Kimonos', price: 300, cost: 150, stock: 5, minStock: 1 }).expect(201);
  const cl = await http.post('/api/classes').set(h).send({ name: `Turma ${label}`, disciplineId, capacity: 20 }).expect(201);
  const sl = await http.post(`/api/classes/${cl.body.id}/slots`).set(h).send({ weekday: 0, startMin: 19 * 60, endMin: 20 * 60 }).expect(201);
  const pl = await http.post('/api/tenant/plans').set(h).send({ name: `Plano ${label}`, price: 199 }).expect(201);
  return {
    token, tenantId: tenant.id, disciplineId, studentId, invoiceId, txId: tx.body.id, productId: pr.body.id,
    classId: cl.body.id, slotId: sl.body.id, planId: pl.body.id,
  };
}

before(async () => {
  await syncCatalog(prisma);
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(mod.createNestApplication<NestExpressApplication>());
  await app.init();
  http = request(app.getHttpServer());
  A = await seed('a');
  B = await seed('b');
});

after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [A?.tenantId, B?.tenantId].filter(Boolean) as string[] } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@e2e.test` } } });
  await app?.close();
  await prisma.$disconnect();
});

describe('usuário da academia A usando ids da academia B', () => {
  // [método, rota, corpo] — tudo com o token de A
  const attempts = (): [string, string, object?][] => [
    ['get', `/api/students/${B.studentId}`],
    ['patch', `/api/students/${B.studentId}`, { name: 'Invadido' }],
    ['get', `/api/students/${B.studentId}/invoices`],
    ['post', `/api/students/${B.studentId}/invoices`, { year: 2027, month: 1, repeat: 1, amount: 1, dueDate: '2027-01-05', paid: false }],
    ['post', `/api/invoices/${B.invoiceId}/pay`, { method: 'PIX' }],
    ['get', `/api/students/${B.studentId}/export`],
    ['post', `/api/students/${B.studentId}/anonymize`],
    ['patch', `/api/finance/transactions/${B.txId}`, { description: 'Invadido' }],
    ['delete', `/api/finance/transactions/${B.txId}`],
    ['patch', `/api/store/products/${B.productId}`, { name: 'Invadido', category: 'x', price: 1, cost: 1, stock: 0, minStock: 0 }],
    ['post', '/api/store/sales', { items: [{ productId: B.productId, qty: 1 }], paymentMethod: 'PIX' }],
    ['post', '/api/store/sales', { items: [{ productId: A.productId, qty: 1 }], studentId: B.studentId, paymentMethod: 'PIX' }],
    ['patch', `/api/classes/${B.classId}`, { name: 'Invadido' }],
    ['post', `/api/classes/${B.classId}/slots`, { weekday: 1, startMin: 19 * 60, endMin: 20 * 60 }],
    ['patch', `/api/classes/slots/${B.slotId}`, { weekday: 2, startMin: 19 * 60, endMin: 20 * 60 }],
    ['delete', `/api/classes/slots/${B.slotId}`],
    ['post', `/api/classes/${B.classId}/students`, { studentId: A.studentId }],
    ['post', `/api/classes/${A.classId}/students`, { studentId: B.studentId }],
    ['delete', `/api/classes/${B.classId}/students/${B.studentId}`],
    ['post', '/api/classes', { name: 'Turma invasora', disciplineId: B.disciplineId, capacity: 10 }],
    ['delete', `/api/classes/${B.classId}`],
    ['patch', `/api/disciplines/${B.disciplineId}`, { name: 'Invadido', color: '#000000', system: 'x', monthlyPrice: 1, levels: [] }],
    ['post', `/api/disciplines/${B.disciplineId}/restore`],
    ['delete', `/api/disciplines/${B.disciplineId}`],
    ['delete', `/api/tenant/plans/${B.planId}`],
    ['get', `/api/graduation/preview?studentId=${B.studentId}&disciplineId=${B.disciplineId}`],
    ['post', '/api/graduation/promote', { studentId: B.studentId, disciplineId: B.disciplineId }],
  ];

  test('toda leitura e escrita é recusada (4xx)', async (t) => {
    const leaks: string[] = [];
    const seen: string[] = [];
    for (const [method, url, body] of attempts()) {
      const req = (http as unknown as Record<string, (u: string) => request.Test>)[method](url).set(auth(A.token));
      const res = await (body ? req.send(body) : req);
      seen.push(`${res.status} ${method.toUpperCase()} ${url.replace(/c[a-z0-9]{24}/g, ':id')}`);
      if (res.status < 400 || res.status >= 500) leaks.push(`${method.toUpperCase()} ${url} → ${res.status}`);
    }
    t.diagnostic(seen.join('\n'));
    assert.deepEqual(leaks, [], `rotas que não recusaram:\n${leaks.join('\n')}`);
  });

  test('listas de A não trazem dados de B', async () => {
    const h = auth(A.token);
    const all = JSON.stringify([
      (await http.get('/api/students?status=all').set(h)).body,
      (await http.get('/api/finance?year=2026&month=1').set(h)).body,
      (await http.get('/api/store').set(h)).body,
      (await http.get('/api/classes').set(h)).body,
      (await http.get('/api/disciplines').set(h)).body,
      (await http.get('/api/tenant').set(h)).body,
      (await http.get(`/api/graduation?disciplineId=${B.disciplineId}`).set(h)).body,
      (await http.get('/api/dashboard').set(h)).body,
    ]);
    for (const id of [B.studentId, B.invoiceId, B.txId, B.productId, B.classId, B.slotId, B.planId, B.disciplineId])
      assert.ok(!all.includes(id), `id de B apareceu para A: ${id}`);
    assert.ok(!all.includes('Aluno b'), 'nome do aluno de B apareceu para A');
  });

  test('dados de B continuam intactos', async () => {
    const h = auth(B.token);
    const st = await http.get(`/api/students/${B.studentId}`).set(h).expect(200);
    assert.equal(st.body.name, 'Aluno b');
    const inv = await http.get(`/api/students/${B.studentId}/invoices`).set(h).expect(200);
    assert.equal(inv.body.rows[0].status !== 'paid' && inv.body.summary.openCount, 1);
    const store = await http.get('/api/store').set(h).expect(200);
    assert.ok(JSON.stringify(store.body).includes('Kimono b'));
    const classes = await http.get('/api/classes').set(h).expect(200);
    assert.ok(JSON.stringify(classes.body).includes('Turma b'));
    assert.ok(await prisma.transaction.findUnique({ where: { id: B.txId } }));
    assert.ok(await prisma.plan.findUnique({ where: { id: B.planId } }));
    assert.equal(await prisma.classSlot.count({ where: { classGroupId: B.classId } }), 1);
  });
});

test('token de A com tenantId de B adulterado é recusado', async () => {
  const [h, , sig] = A.token.split('.');
  const payload = JSON.parse(Buffer.from(A.token.split('.')[1], 'base64url').toString());
  const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, tenantId: B.tenantId })).toString('base64url')}.${sig}`;
  await http.get('/api/students').set(auth(forged)).expect(401);
});
