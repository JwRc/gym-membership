export const BILLING_QUEUE = 'billing';
export const NOTIFICATIONS_QUEUE = 'notifications';

export const BillingJobs = {
  GENERATE_INVOICES: 'generate-invoices', // diário; gera o mês seguinte no dia 25 (ou sob demanda)
  MARK_OVERDUE: 'mark-overdue', // diário; marca atrasadas após a tolerância
} as const;

export const NotificationJobs = {
  LOW_STOCK: 'low-stock',
  INVOICE_OVERDUE: 'invoice-overdue',
} as const;

export interface GenerateInvoicesData {
  tenantId?: string; // ausente = todas as academias com geração automática
  year?: number;
  month?: number;
  force?: boolean; // ignora a regra do dia 25
}
