import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financeSituation, invoiceState } from './invoices';

const T = new Date('2026-11-07T00:00:00Z');
const d = (s: string) => new Date(s + 'T00:00:00Z');

test('estado da mensalidade respeita a tolerância', () => {
  assert.equal(invoiceState({ status: 'PENDING', dueDate: d('2026-11-07') }, T, 3), 'today');
  assert.equal(invoiceState({ status: 'PENDING', dueDate: d('2026-11-10') }, T, 3), 'upcoming');
  assert.equal(invoiceState({ status: 'PENDING', dueDate: d('2026-11-05') }, T, 3), 'grace');
  assert.equal(invoiceState({ status: 'PENDING', dueDate: d('2026-11-01') }, T, 3), 'overdue');
  assert.equal(invoiceState({ status: 'OVERDUE', dueDate: d('2026-11-06') }, T, 3), 'overdue');
  assert.equal(invoiceState({ status: 'PAID', dueDate: d('2026-10-01') }, T, 3), 'paid');
});

test('situação financeira do aluno', () => {
  assert.deepEqual(financeSituation('ACTIVE', [{ status: 'OVERDUE', dueDate: d('2026-10-05') }], T, 3), { key: 'late', label: 'Atrasado · 33 dias', days: 33 });
  assert.equal(financeSituation('ACTIVE', [{ status: 'PENDING', dueDate: d('2026-11-05') }], T, 3).label, 'Vencida');
  assert.equal(financeSituation('ACTIVE', [{ status: 'PENDING', dueDate: d('2026-11-07') }], T, 3).label, 'Vence hoje');
  assert.equal(financeSituation('ACTIVE', [], T, 3).key, 'ok');
  assert.equal(financeSituation('LOCKED', [], T, 3).label, 'Isento');
  assert.equal(financeSituation('INACTIVE', [], T, 3).label, 'Sem cobrança');
});
