const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v: number) => brlFmt.format(v).replace(/ /g, ' ');
export const signedBrl = (v: number) => (v < 0 ? '− ' : '') + brl(Math.abs(v));
export const pct = (v: number) => `${Math.round(v * 100)}%`;

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "2026-10-05" → "05/10/2026" */
export const br = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const brShort = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const longDate = (d = new Date()) => {
  const s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const greeting = (d = new Date()) => (d.getHours() < 12 ? 'Bom dia' : d.getHours() < 18 ? 'Boa tarde' : 'Boa noite');
export const firstName = (n: string) => n.split(' ')[0];

/** Converte "1.234,56" ou "1234.56" em número. */
export const parseMoney = (s: string) => {
  const t = s.trim().replace(/[^\d,.-]/g, '');
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : NaN;
};
export const moneyInput = (n: number) => n.toFixed(2).replace('.', ',');

export const PAYMENT_OPTIONS = [
  { v: 'PIX', label: 'Pix' },
  { v: 'CASH', label: 'Dinheiro' },
  { v: 'DEBIT', label: 'Cartão de débito' },
  { v: 'CREDIT', label: 'Cartão de crédito' },
] as const;
