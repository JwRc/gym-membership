import { BillingMode, DiscountKind, DiscountOverride, DiscountValueType, StudentStatus } from '@prisma/client';

/** Regra do desconto família: tipo de regra + R$ ou % + valor. */
export interface DiscountRule {
  kind: DiscountKind;
  valueType: DiscountValueType;
  value: number;
}

export const NO_DISCOUNT: DiscountRule = { kind: 'NONE', valueType: 'PERCENT', value: 0 };

export interface FamilyRuleFields {
  discountOverride: DiscountOverride;
  discountKind: DiscountKind | null;
  discountType: DiscountValueType | null;
  discountValue: number | null;
}

/**
 * Regra que vale para a família: a padrão da academia (INHERIT), a própria (CUSTOM) ou nenhuma.
 * O desconto sobre o total da família só existe na cobrança consolidada: numa família separada vira "sem desconto".
 */
export function effectiveRule(tenant: DiscountRule, fam: FamilyRuleFields, mode: BillingMode): DiscountRule {
  let rule: DiscountRule;
  if (fam.discountOverride === 'NONE') rule = NO_DISCOUNT;
  else if (fam.discountOverride === 'CUSTOM')
    rule = { kind: fam.discountKind ?? 'NONE', valueType: fam.discountType ?? 'PERCENT', value: fam.discountValue ?? 0 };
  else rule = tenant;
  if (rule.kind === 'FAMILY_FIXED' && mode === 'SEPARATE') return NO_DISCOUNT;
  return rule;
}

/** Mensagem de erro (pt-BR) ou null. Sem `mode`, valida a regra padrão da academia. */
export function validateRule(rule: DiscountRule, mode?: BillingMode): string | null {
  if (rule.kind === 'NONE') return null;
  if (!Number.isFinite(rule.value) || rule.value < 0) return 'O desconto não pode ser negativo.';
  if (rule.valueType === 'PERCENT' && rule.value > 100) return 'O desconto percentual não pode passar de 100%.';
  if (rule.kind === 'FAMILY_FIXED' && mode === 'SEPARATE')
    return 'O desconto sobre o total da família só vale na cobrança consolidada.';
  return null;
}

export interface MemberIn {
  id: string;
  fee: number;
  status: StudentStatus;
  anonymized?: boolean;
}

export interface MemberAmount {
  id: string;
  /** mensalidade cheia (monthlyFee) */
  gross: number;
  discount: number;
  /** valor a cobrar */
  amount: number;
  /** trancado: mensalidade isenta, não conta para o desconto */
  exempt: boolean;
  /** posição na regra progressiva (1 = paga cheio); null fora dela */
  position: number | null;
  note: string | null;
}

const cents = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const pctOf = (c: number, pct: number) => Math.round((c * pct) / 100);

/**
 * Valor de cada membro com o desconto família.
 * Contam só alunos ativos; trancados ficam isentos e inativos/anonimizados ficam de fora.
 * Na progressiva o 1º (maior mensalidade) paga cheio e o maior desconto vai para a menor mensalidade.
 * O desconto nunca passa da mensalidade.
 */
export function familyAmounts(members: MemberIn[], rule: DiscountRule): MemberAmount[] {
  const billable = members.filter((m) => !m.anonymized && m.status !== 'INACTIVE');
  const counted = billable
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({ id: m.id, fee: cents(m.fee) }))
    .sort((a, b) => b.fee - a.fee || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const disc = new Map<string, { d: number; pos: number | null; note: string | null }>();
  const D = rule.valueType === 'FIXED' ? cents(rule.value) : rule.value;

  if (rule.kind === 'STATIC') {
    for (const m of counted) {
      const d = Math.min(m.fee, rule.valueType === 'FIXED' ? D : pctOf(m.fee, D));
      disc.set(m.id, { d, pos: null, note: 'Desconto família' });
    }
  } else if (rule.kind === 'PROGRESSIVE') {
    counted.forEach((m, i) => {
      const k = i; // (k−1) com k começando em 1
      const raw = rule.valueType === 'FIXED' ? k * D : pctOf(m.fee, k * D);
      disc.set(m.id, { d: Math.min(m.fee, raw), pos: i + 1, note: `Desconto família · ${i + 1}º membro` });
    });
  } else if (rule.kind === 'FAMILY_FIXED') {
    const sum = counted.reduce((s, m) => s + m.fee, 0);
    const total = Math.min(sum, rule.valueType === 'FIXED' ? D : pctOf(sum, D));
    const shares = counted.map((m) => (sum > 0 ? Math.floor((total * m.fee) / sum) : 0));
    let rest = total - shares.reduce((s, v) => s + v, 0);
    // sobra de centavos: para as maiores mensalidades primeiro
    for (let i = 0; rest > 0 && i < counted.length; i++) {
      const add = Math.min(rest, counted[i].fee - shares[i]);
      shares[i] += add;
      rest -= add;
    }
    counted.forEach((m, i) => disc.set(m.id, { d: shares[i], pos: null, note: 'Desconto família (rateado)' }));
  }

  return billable.map((m) => {
    const gross = cents(m.fee);
    if (m.status === 'LOCKED')
      return { id: m.id, gross: reais(gross), discount: 0, amount: reais(gross), exempt: true, position: null, note: null };
    const x = disc.get(m.id);
    const d = x?.d ?? 0;
    return {
      id: m.id,
      gross: reais(gross),
      discount: reais(d),
      amount: reais(gross - d),
      exempt: false,
      position: x?.pos ?? null,
      note: d > 0 ? (x?.note ?? null) : null,
    };
  });
}
