export type Role = 'ADMIN' | 'STUDENT';
export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';
export type PaymentMethod = 'PIX' | 'CASH' | 'DEBIT' | 'CREDIT';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** permissões do perfil (base do RBAC; na V1 o admin tem todas) */
  permissions: string[];
  studentId: string | null;
  tenant: { id: string; name: string; initials: string; code: string; disciplines: string[] };
}

export interface Tag { id: string; name: string; color: string }
export interface Plan {
  id: string; name: string; description: string | null; price: number; archived: boolean;
  disciplines: Tag[]; classGroups: Tag[]; studentCount: number;
  students: { id: string; name: string; initials: string; status: StudentStatus }[];
}
export interface Belt { color: string; color2?: string | null; bar: string; hasBar: boolean; stripes: number; name: string; label: string }
export interface Finance { key: 'ok' | 'today' | 'late' | 'exempt' | 'none'; label: string; days?: number }

export interface RankView {
  discipline: Tag;
  disciplineId?: string;
  levelOrder: number;
  degree: number;
  belt: Belt;
  next: { levelOrder: number; degree: number; belt: Belt } | null;
  nextLabel: string;
  since: string;
  timeInRank: string;
  history?: { id?: string; title: string; date: string; color: string; color2?: string | null; instructor: string | null }[];
}

export interface StudentRow {
  id: string; name: string; initials: string; email: string | null; phone: string | null; age: number; birthDate: string;
  status: StudentStatus; finance: Finance; monthlyFee: number; dueDay: number; disciplines: Tag[]; ranks: RankView[];
  family: { id: string; name: string } | null;
}

export type InvoiceState = 'paid' | 'overdue' | 'grace' | 'today' | 'upcoming' | 'exempt';
export interface InvoiceRow {
  id: string; ref: string; year: number; month: number; dueDate: string; amount: number; paidAt: string | null; method: string | null;
  state: InvoiceState; label: string; manual: boolean; canPay: boolean;
  /** valor cheio e desconto família (gross = amount + discount) */
  gross: number; discount: number; discountNote: string | null;
  /** faz parte da cobrança consolidada da família: paga-se pela família */
  charge: { id: string; familyId: string; familyName: string } | null;
}
export interface StudentInvoices {
  summary: { paidYear: number; paidYearCount: number; open: number; openCount: number; next: { dueDate: string; amount: number } | null; monthlyFee: number; dueDay: number };
  rows: InvoiceRow[];
}

export interface StudentDetail {
  id: string; name: string; initials: string; gender: 'M' | 'F' | null; status: StudentStatus; finance: Finance;
  email: string | null; phone: string | null; birthDate: string; age: number; startDate: string; since: string;
  monthlyFee: number; dueDay: number; plan: { id: string; name: string } | null; hasAccess: boolean;
  family: { id: string; name: string; guardianName: string; isGuardian: boolean; billingMode: BillingMode; dueDay: number | null } | null;
  medicalNotes: string | null; guardian: { name: string; relation: string | null; phone: string | null } | null;
  /** LGPD: quando o aluno/responsável autorizou o uso dos dados */
  consentAt: string | null;
  ranks: (RankView & { history: NonNullable<RankView['history']> })[];
  classes: { id: string; name: string; color: string; instructor: string | null; days: string; time: string }[];
  invoices: StudentInvoices;
  nextClass?: { name: string; color: string; instructor: string | null; when: string; inText: string } | null;
}

export interface ClassSlot { id: string; weekday: number; startMin: number; endMin: number }
export interface ClassGroup {
  id: string; name: string; discipline: Tag; instructor: { id: string; name: string } | null; capacity: number; count: number;
  slots: ClassSlot[]; days: string; time: string; students: { id: string; name: string; initials: string }[];
}

export interface FinanceRowT {
  id: string; date: string; description: string; note: string | null; category: string; type: 'INCOME' | 'EXPENSE'; amount: number;
  status: 'paid' | 'pending' | 'overdue'; source: string; studentId?: string;
}
export interface FinanceSummary {
  income: number; expense: number; incomeOpen: number; incomeOverdue: number; expenseOpen: number; balance: number; forecast: number; incomeAll: number; expenseAll: number;
}

export interface Level { order?: number; name: string; color: string; color2?: string | null; minMonths: number | null; minClasses: number | null }
export interface DisciplineT {
  id: string; name: string; color: string; system: string; origin: { id: string; name: string } | null; customized: boolean; customizedAt: string | null;
  degreesPerLevel: number; levels: Level[]; instructor: { id: string; name: string } | null; monthlyPrice: number; students: number;
}

// ─── Famílias ───

export type BillingMode = 'SEPARATE' | 'CONSOLIDATED';
export type DiscountKind = 'NONE' | 'STATIC' | 'PROGRESSIVE' | 'FAMILY_FIXED';
export type DiscountValueType = 'FIXED' | 'PERCENT';
export type DiscountOverride = 'INHERIT' | 'CUSTOM' | 'NONE';
export interface DiscountRule { kind: DiscountKind; valueType: DiscountValueType; value: number }

export interface FamilyRow {
  id: string; name: string;
  guardian: { name: string; email: string; phone: string | null; trains: boolean };
  members: { id: string; name: string; status: StudentStatus }[];
  activeMembers: number; billingMode: BillingMode; dueDay: number | null; discountOverride: DiscountOverride;
  rule: DiscountRule; finance: Finance; openAmount: number;
}

export interface FamilyMember {
  id: string; name: string; initials: string; email: string | null; phone: string | null; age: number; status: StudentStatus;
  dueDay: number; isGuardian: boolean; monthlyFee: number;
  next: { amount: number; discount: number; exempt: boolean; position: number | null; note: string | null } | null;
}
export interface FamilyDetail {
  id: string; name: string;
  guardian: { id: string; name: string; email: string; phone: string | null; cpf: string | null; relation: string | null; studentId: string | null };
  billingMode: BillingMode; dueDay: number | null; discountOverride: DiscountOverride;
  customRule: DiscountRule | null; tenantRule: DiscountRule; rule: DiscountRule; warning: string | null;
  members: FamilyMember[];
  totals: { gross: number; discount: number; amount: number };
}

export interface FamilyInvoice {
  id: string; ref: string; student: { id: string; name: string }; dueDate: string; amount: number; discount: number; gross: number;
  discountNote: string | null; paidAt: string | null; method: string | null; state: InvoiceState; label: string; canPay: boolean;
}
export interface FamilyChargeRow {
  id: string; ref: string; year: number; month: number; dueDate: string; total: number; discount: number; paidAt: string | null;
  method: string | null; state: InvoiceState; label: string; canPay: boolean; invoices: FamilyInvoice[];
}
export interface FamilyFinance {
  summary: { open: number; openCount: number; paidYear: number; discountYear: number };
  charges: FamilyChargeRow[];
  invoices: FamilyInvoice[];
}
