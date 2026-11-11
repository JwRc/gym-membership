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
export interface Belt { color: string; bar: string; hasBar: boolean; stripes: number; name: string; label: string }
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
  history?: { title: string; date: string; color: string; instructor: string | null }[];
}

export interface StudentRow {
  id: string; name: string; initials: string; email: string; phone: string | null; age: number; birthDate: string;
  status: StudentStatus; finance: Finance; monthlyFee: number; dueDay: number; disciplines: Tag[]; ranks: RankView[];
}

export interface InvoiceRow {
  id: string; ref: string; year: number; month: number; dueDate: string; amount: number; paidAt: string | null; method: string | null;
  state: 'paid' | 'overdue' | 'grace' | 'today' | 'upcoming' | 'exempt'; label: string; manual: boolean; canPay: boolean;
}
export interface StudentInvoices {
  summary: { paidYear: number; paidYearCount: number; open: number; openCount: number; next: { dueDate: string; amount: number } | null; monthlyFee: number; dueDay: number };
  rows: InvoiceRow[];
}

export interface StudentDetail {
  id: string; name: string; initials: string; gender: 'M' | 'F' | null; status: StudentStatus; finance: Finance;
  email: string; phone: string | null; birthDate: string; age: number; startDate: string; since: string;
  monthlyFee: number; dueDay: number; plan: { id: string; name: string } | null; hasAccess: boolean;
  medicalNotes: string | null; guardian: { name: string; relation: string | null; phone: string | null } | null;
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

export interface Level { order?: number; name: string; color: string; minMonths: number | null; minClasses: number | null }
export interface DisciplineT {
  id: string; name: string; color: string; system: string; origin: { id: string; name: string } | null; customized: boolean; customizedAt: string | null;
  degreesPerLevel: number; levels: Level[]; instructor: { id: string; name: string } | null; monthlyPrice: number; students: number;
}
