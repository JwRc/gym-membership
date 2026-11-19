import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiscountRule, MemberIn, NO_DISCOUNT, effectiveRule, familyAmounts, validateRule } from './family-discount';

const m = (id: string, fee: number, status: MemberIn['status'] = 'ACTIVE', anonymized = false): MemberIn => ({ id, fee, status, anonymized });
const rule = (kind: DiscountRule['kind'], valueType: DiscountRule['valueType'], value: number): DiscountRule => ({ kind, valueType, value });
const byId = (rows: ReturnType<typeof familyAmounts>) => Object.fromEntries(rows.map((r) => [r.id, r]));

test('sem regra: todos pagam cheio', () => {
  const r = familyAmounts([m('a', 100), m('b', 150)], NO_DISCOUNT);
  assert.deepEqual(r.map((x) => [x.amount, x.discount, x.note]), [[100, 0, null], [150, 0, null]]);
});

test('estática em R$ e em %', () => {
  const f = byId(familyAmounts([m('a', 100), m('b', 150)], rule('STATIC', 'FIXED', 20)));
  assert.equal(f.a.amount, 80);
  assert.equal(f.b.amount, 130);
  assert.equal(f.a.note, 'Desconto família');
  const p = byId(familyAmounts([m('a', 100), m('b', 155)], rule('STATIC', 'PERCENT', 10)));
  assert.equal(p.a.discount, 10);
  assert.equal(p.b.discount, 15.5);
});

test('progressiva em R$: maior desconto na menor mensalidade', () => {
  const f = byId(familyAmounts([m('a', 100), m('b', 120), m('c', 150)], rule('PROGRESSIVE', 'FIXED', 20)));
  assert.deepEqual([f.c.position, f.c.discount, f.c.amount], [1, 0, 150]);
  assert.deepEqual([f.b.position, f.b.discount, f.b.amount], [2, 20, 100]);
  assert.deepEqual([f.a.position, f.a.discount, f.a.amount], [3, 40, 60]);
  assert.equal(f.a.note, 'Desconto família · 3º membro');
  assert.equal(f.c.note, null);
});

test('progressiva com empate usa o id como desempate', () => {
  const f = byId(familyAmounts([m('b', 100), m('a', 100)], rule('PROGRESSIVE', 'FIXED', 10)));
  assert.equal(f.a.position, 1);
  assert.equal(f.b.position, 2);
});

test('progressiva em % sem teto zera a mensalidade, nunca negativa', () => {
  const r = familyAmounts([1, 2, 3, 4, 5].map((i) => m(`m${i}`, 100)), rule('PROGRESSIVE', 'PERCENT', 30));
  assert.deepEqual(r.map((x) => x.amount), [100, 70, 40, 10, 0]);
});

test('total da família em R$: rateio proporcional fecha o centavo', () => {
  const r = familyAmounts([m('a', 100), m('b', 100), m('c', 150)], rule('FAMILY_FIXED', 'FIXED', 50));
  const f = byId(r);
  const sum = r.reduce((s, x) => s + Math.round(x.discount * 100), 0);
  assert.equal(sum, 5000);
  assert.equal(f.a.discount, 14.28);
  assert.equal(f.b.discount, 14.28);
  assert.equal(f.c.discount, 21.44); // 21,42 + sobra de 2 centavos na maior
});

test('total da família em %', () => {
  const r = familyAmounts([m('a', 100), m('b', 300)], rule('FAMILY_FIXED', 'PERCENT', 10));
  const f = byId(r);
  assert.equal(f.a.discount, 10);
  assert.equal(f.b.discount, 30);
});

test('desconto maior que a mensalidade é limitado', () => {
  const f = byId(familyAmounts([m('a', 50)], rule('STATIC', 'FIXED', 80)));
  assert.equal(f.a.amount, 0);
  assert.equal(f.a.discount, 50);
  const g = byId(familyAmounts([m('a', 50), m('b', 30)], rule('FAMILY_FIXED', 'FIXED', 500)));
  assert.equal(g.a.amount + g.b.amount, 0);
});

test('trancado fica isento e não conta; inativo e anonimizado ficam de fora', () => {
  const r = familyAmounts(
    [m('a', 150), m('l', 120, 'LOCKED'), m('b', 100), m('i', 90, 'INACTIVE'), m('x', 80, 'ACTIVE', true)],
    rule('PROGRESSIVE', 'FIXED', 20),
  );
  const f = byId(r);
  assert.deepEqual(Object.keys(f).sort(), ['a', 'b', 'l']);
  assert.deepEqual([f.l.exempt, f.l.amount, f.l.position], [true, 120, null]);
  assert.equal(f.b.position, 2);
  assert.equal(f.b.amount, 80);
});

test('família de um membro: progressiva não dá desconto, estática dá', () => {
  assert.equal(familyAmounts([m('a', 100)], rule('PROGRESSIVE', 'FIXED', 20))[0].amount, 100);
  assert.equal(familyAmounts([m('a', 100)], rule('STATIC', 'FIXED', 20))[0].amount, 80);
});

test('mensalidade zero', () => {
  const r = familyAmounts([m('a', 0), m('b', 0)], rule('FAMILY_FIXED', 'FIXED', 50));
  assert.deepEqual(r.map((x) => x.amount), [0, 0]);
});

test('regra efetiva: herda, própria, nenhuma; total da família some na separada', () => {
  const tenant = rule('STATIC', 'FIXED', 20);
  const fam = { discountOverride: 'INHERIT' as const, discountKind: null, discountType: null, discountValue: null };
  assert.deepEqual(effectiveRule(tenant, fam, 'SEPARATE'), tenant);
  assert.deepEqual(effectiveRule(tenant, { ...fam, discountOverride: 'NONE' }, 'CONSOLIDATED'), NO_DISCOUNT);
  assert.deepEqual(
    effectiveRule(tenant, { discountOverride: 'CUSTOM', discountKind: 'PROGRESSIVE', discountType: 'PERCENT', discountValue: 10 }, 'SEPARATE'),
    rule('PROGRESSIVE', 'PERCENT', 10),
  );
  assert.deepEqual(effectiveRule(rule('FAMILY_FIXED', 'FIXED', 200), fam, 'SEPARATE'), NO_DISCOUNT);
  assert.deepEqual(effectiveRule(rule('FAMILY_FIXED', 'FIXED', 200), fam, 'CONSOLIDATED'), rule('FAMILY_FIXED', 'FIXED', 200));
});

test('validação da regra', () => {
  assert.equal(validateRule(rule('STATIC', 'FIXED', 20)), null);
  assert.match(validateRule(rule('STATIC', 'FIXED', -1))!, /negativo/);
  assert.match(validateRule(rule('STATIC', 'PERCENT', 101))!, /100%/);
  assert.equal(validateRule(rule('FAMILY_FIXED', 'FIXED', 200)), null);
  assert.match(validateRule(rule('FAMILY_FIXED', 'FIXED', 200), 'SEPARATE')!, /consolidada/);
  assert.equal(validateRule(rule('NONE', 'PERCENT', -5)), null);
});
