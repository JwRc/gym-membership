/**
 * Famílias: titular, desconto família, cobrança consolidada e pagamento, de ponta a ponta.
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
import { today } from '../src/common/util';

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
let hB: { Authorization: string };
const tenantIds: string[] = [];
let planId: string;
let n = 0;

const t = today();
const next = t.getUTCMonth() === 11 ? { year: t.getUTCFullYear() + 1, month: 1 } : { year: t.getUTCFullYear(), month: t.getUTCMonth() + 2 };

const student = (extra: object) =>
  http.post('/api/students').set(h).send({
    name: `Aluno ${++n}`, birthDate: '2015-01-01', email: `f${n}-${run}@e2e.test`, monthlyFee: 100, dueDay: 5, consent: true, planId, ...extra,
  });

async function academy(label: string) {
  const email = `${label}-${run}@e2e.test`;
  const r = await createAcademy(prisma, { academyName: `Famílias ${label} ${run}`, adminName: 'Admin', adminEmail: email, password: PASSWORD, disciplines: ['bjj'] });
  tenantIds.push(r.tenant.id);
  const login = await http.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return { Authorization: `Bearer ${login.body.token}` };
}

before(async () => {
  await syncCatalog(prisma);
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(mod.createNestApplication<NestExpressApplication>());
  await app.init();
  http = request(app.getHttpServer());
  h = await academy('a');
  hB = await academy('b');
  const disc = (await http.get('/api/disciplines').set(h).expect(200)).body.disciplines as { id: string }[];
  planId = (await http.post('/api/plans').set(h).send({ name: 'Kids', price: 100, disciplineIds: [disc[0].id] }).expect(201)).body.id;
});

after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@e2e.test` } } });
  await app?.close();
  await prisma.$disconnect();
});

test('família consolidada com desconto progressivo: geração, cobrança única e pagamento', async () => {
  await http.patch('/api/tenant').set(h).send({ familyDiscountKind: 'PROGRESSIVE', familyDiscountType: 'FIXED', familyDiscountValue: 20 }).expect(200);
  await http.patch('/api/tenant').set(h).send({ familyDiscountType: 'PERCENT', familyDiscountValue: 150 }).expect(400);

  // aluno avulso precisa de e-mail
  await student({ email: undefined }).expect(400);

  const a = (await student({ monthlyFee: 150 }).expect(201)).body.id as string;
  const b = (await student({ monthlyFee: 120 }).expect(201)).body.id as string;

  // titular não treina; dia de vencimento precisa ser um dos da academia
  const fam = {
    guardian: { name: 'Maria Souza', email: `maria-${run}@e2e.test`, cpf: '123.456.789-00' },
    billingMode: 'CONSOLIDATED', dueDay: 10, discountOverride: 'INHERIT', memberIds: [a, b],
  };
  await http.post('/api/families').set(h).send({ ...fam, dueDay: 11 }).expect(400);
  const familyId = (await http.post('/api/families').set(h).send(fam).expect(201)).body.id as string;
  await http.post('/api/families').set(h).send({ ...fam, memberIds: [] }).expect(409); // mesmo e-mail de titular

  // criança entra direto na família, sem e-mail
  const c = (await student({ email: '', monthlyFee: 100, familyId }).expect(201)).body.id as string;

  const detail = (await http.get(`/api/families/${familyId}`).set(h).expect(200)).body;
  assert.equal(detail.name, 'Família Souza');
  assert.equal(detail.members.length, 3);
  assert.deepEqual(detail.totals, { gross: 370, discount: 60, amount: 310 });

  // mês seguinte: 150 cheio, 120 − 20, 100 − 40; uma cobrança no dia 10
  await http.post('/api/jobs/invoices/generate').set(h).send(next).expect(200);
  const inv = async () =>
    Object.fromEntries(
      (await prisma.invoice.findMany({ where: { studentId: { in: [a, b, c] }, ...next } })).map((i) => [i.studentId, i]),
    );
  let rows = await inv();
  assert.deepEqual([a, b, c].map((id) => Number(rows[id].amount)), [150, 100, 60]);
  assert.deepEqual([a, b, c].map((id) => Number(rows[id].discount)), [0, 20, 40]);
  const charges = await prisma.familyCharge.findMany({ where: { familyId } });
  const charge = charges.find((x) => x.year === next.year && x.month === next.month)!;
  assert.ok(charge);
  assert.equal(charge.dueDate.getUTCDate(), 10);
  assert.ok([a, b, c].every((id) => rows[id].familyChargeId === charge.id));

  // idempotente
  const again = (await http.post('/api/jobs/invoices/generate').set(h).send(next).expect(200)).body;
  assert.equal(again.created, 0);

  // mensalidade de membro dentro da cobrança: só pela família
  await http.post(`/api/invoices/${rows[c].id}/pay`).set(h).send({ method: 'PIX' }).expect(400);
  const st = (await http.get(`/api/students/${c}/invoices`).set(h).expect(200)).body;
  const r = st.rows.find((x: { id: string }) => x.id === rows[c].id);
  assert.equal(r.canPay, false);
  assert.equal(r.charge.familyId, familyId);
  assert.equal(r.gross, 100);

  const paid = (await http.post(`/api/families/${familyId}/charges/${charge.id}/pay`).set(h).send({ method: 'PIX' }).expect(200)).body;
  assert.equal(paid.total, 310);
  rows = await inv();
  assert.ok([a, b, c].every((id) => rows[id].status === 'PAID'));
  const txs = await prisma.transaction.findMany({ where: { invoiceId: { in: [a, b, c].map((id) => rows[id].id) } } });
  assert.equal(txs.length, 3);
  assert.equal(txs.reduce((s, x) => s + Number(x.amount), 0), 310);
  await http.post(`/api/families/${familyId}/charges/${charge.id}/pay`).set(h).send({ method: 'PIX' }).expect(400);

  const fin = (await http.get(`/api/families/${familyId}/finance`).set(h).expect(200)).body;
  assert.equal(fin.charges.find((x: { id: string }) => x.id === charge.id).state, 'paid');

  // membro sem e-mail não sai da família; com e-mail sai
  await http.delete(`/api/families/${familyId}/members/${c}`).set(h).expect(400);
  await http.delete(`/api/families/${familyId}/members/${b}`).set(h).expect(200);

  // mudar a regra não mexe nas mensalidades já geradas
  await http.patch('/api/tenant').set(h).send({ familyDiscountKind: 'NONE' }).expect(200);
  rows = await inv();
  assert.equal(Number(rows[c].amount), 60);

  // outra academia não enxerga a família
  await http.get(`/api/families/${familyId}`).set(hB).expect(404);
  await http.post(`/api/families/${familyId}/members`).set(hB).send({ studentId: a }).expect(404);
});

test('família separada: total da família não vale; personalizada recusa total da família; saída devolve a mensalidade avulsa', async () => {
  await http.patch('/api/tenant').set(h).send({ familyDiscountKind: 'FAMILY_FIXED', familyDiscountType: 'FIXED', familyDiscountValue: 50 }).expect(200);
  const a = (await student({ monthlyFee: 100 }).expect(201)).body.id as string;
  const b = (await student({ monthlyFee: 100 }).expect(201)).body.id as string;
  const base = { guardian: { name: 'João Lima', email: `joao-${run}@e2e.test`, studentId: a }, billingMode: 'SEPARATE', memberIds: [b] };
  await http
    .post('/api/families').set(h)
    .send({ ...base, discountOverride: 'CUSTOM', discountKind: 'FAMILY_FIXED', discountType: 'FIXED', discountValue: 50 })
    .expect(400);
  const familyId = (await http.post('/api/families').set(h).send({ ...base, discountOverride: 'INHERIT' }).expect(201)).body.id as string;
  const d = (await http.get(`/api/families/${familyId}`).set(h).expect(200)).body;
  assert.ok(d.warning);
  assert.equal(d.totals.discount, 0);
  assert.ok(d.members.find((m: { id: string }) => m.id === a).isGuardian);

  // titular-aluno não sai sem trocar o titular
  await http.delete(`/api/families/${familyId}/members/${a}`).set(h).expect(400);

  // passa a consolidada com R$ 50 sobre o total: rateio igual
  await http.patch(`/api/families/${familyId}`).set(h).send({ billingMode: 'CONSOLIDATED', dueDay: 15 }).expect(200);
  await http.post('/api/jobs/invoices/generate').set(h).send(next).expect(200);
  const inv = await prisma.invoice.findMany({ where: { studentId: { in: [a, b] }, ...next } });
  assert.deepEqual(inv.map((i) => Number(i.amount)).sort(), [75, 75]);
  const chargeId = inv[0].familyChargeId!;
  assert.ok(chargeId);

  // b sai: a mensalidade em aberto vira avulsa, com o valor que já tinha
  await http.delete(`/api/families/${familyId}/members/${b}`).set(h).expect(200);
  const ib = await prisma.invoice.findFirstOrThrow({ where: { studentId: b, ...next } });
  assert.equal(ib.familyChargeId, null);
  assert.equal(Number(ib.amount), 75);
  await http.post(`/api/invoices/${ib.id}/pay`).set(h).send({ method: 'CASH' }).expect(201);

  // desfaz a família: cobrança some, mensalidade de a fica avulsa
  await http.delete(`/api/families/${familyId}`).set(h).expect(200);
  assert.equal(await prisma.familyCharge.count({ where: { id: chargeId } }), 0);
  const ia = await prisma.invoice.findFirstOrThrow({ where: { studentId: a, ...next } });
  assert.equal(ia.familyChargeId, null);
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: a } })).familyId, null);
});
