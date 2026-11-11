import { Invoice, StudentStatus } from '@prisma/client';
import { diffDays } from '../common/util';

export type InvoiceState = 'paid' | 'overdue' | 'grace' | 'today' | 'upcoming' | 'exempt';

export const INVOICE_LABEL: Record<InvoiceState, string> = {
  paid: 'Pago',
  overdue: 'Atrasado',
  grace: 'Vencida',
  today: 'Vence hoje',
  upcoming: 'A vencer',
  exempt: 'Trancado',
};

type Inv = Pick<Invoice, 'status' | 'dueDate'>;

/** Estado efetivo considerando a data de hoje e a tolerância da academia. */
export function invoiceState(inv: Inv, today: Date, toleranceDays: number): InvoiceState {
  if (inv.status === 'PAID') return 'paid';
  if (inv.status === 'EXEMPT') return 'exempt';
  const late = diffDays(inv.dueDate, today);
  if (late === 0) return 'today';
  if (late < 0) return 'upcoming';
  if (inv.status === 'OVERDUE' || late > toleranceDays) return 'overdue';
  return 'grace';
}

export type FinanceKey = 'ok' | 'today' | 'late' | 'exempt' | 'none';
export interface FinanceSituation {
  key: FinanceKey;
  label: string;
  days?: number;
}

/** Situação financeira do aluno (coluna "Financeiro" da lista). */
export function financeSituation(status: StudentStatus, invoices: Inv[], today: Date, tol: number): FinanceSituation {
  if (status === 'LOCKED') return { key: 'exempt', label: 'Isento' };
  if (status === 'INACTIVE') return { key: 'none', label: 'Sem cobrança' };
  let maxLate = -1;
  let dueNow = false;
  let grace = false;
  for (const inv of invoices) {
    const s = invoiceState(inv, today, tol);
    if (s === 'overdue') maxLate = Math.max(maxLate, diffDays(inv.dueDate, today));
    if (s === 'today') dueNow = true;
    if (s === 'grace') grace = true;
  }
  if (maxLate >= 0) return { key: 'late', label: `Atrasado · ${maxLate} dias`, days: maxLate };
  if (grace) return { key: 'today', label: 'Vencida' };
  if (dueNow) return { key: 'today', label: 'Vence hoje' };
  return { key: 'ok', label: 'Em dia' };
}
