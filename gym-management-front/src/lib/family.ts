import type { BillingMode, DiscountKind, DiscountRule, DiscountValueType } from '../api/types';
import { brl } from './format';

export const BILLING_LABEL: Record<BillingMode, string> = { SEPARATE: 'Separada', CONSOLIDATED: 'Consolidada' };

export const KIND_OPTIONS: { v: Exclude<DiscountKind, 'NONE'>; label: string; hint: string }[] = [
  { v: 'STATIC', label: 'Fixo por membro', hint: 'Cada membro recebe o mesmo desconto.' },
  { v: 'PROGRESSIVE', label: 'Progressivo', hint: 'O 1º paga cheio, o 2º recebe 1×, o 3º 2×… O maior desconto vai para a menor mensalidade.' },
  { v: 'FAMILY_FIXED', label: 'Total da família', hint: 'Um desconto sobre o total, rateado entre as mensalidades. Só na cobrança consolidada.' },
];

const val = (t: DiscountValueType, v: number) => (t === 'PERCENT' ? `${String(v).replace('.', ',')}%` : brl(v));

/** "R$ 20,00 por membro", "Progressivo · +10% a cada membro"… */
export function ruleText(r: DiscountRule | null | undefined): string {
  if (!r || r.kind === 'NONE' || !(r.value > 0)) return 'Sem desconto';
  const v = val(r.valueType, r.value);
  if (r.kind === 'STATIC') return `${v} por membro`;
  if (r.kind === 'PROGRESSIVE') return `Progressivo · +${v} a cada membro`;
  return `${v} sobre o total da família`;
}
