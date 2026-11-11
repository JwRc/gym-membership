import { Prisma } from '@prisma/client';

/* ── Datas ────────────────────────────────────────────────────
 * Colunas @db.Date são tratadas como meia-noite UTC.
 * "Hoje" é calculado no fuso da academia (APP_TIMEZONE).       */

const TZ = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
export const DAY_MS = 86_400_000;

export function todayISO(now = new Date()): string {
  if (process.env.APP_TODAY) return process.env.APP_TODAY; // útil para demos/testes
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function today(): Date {
  return dateOnly(todayISO());
}
/** Minutos desde 00:00 no fuso da academia. */
export function nowMinutes(now = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now)
    .split(':')
    .map(Number);
  return h * 60 + m;
}
export function dateOnly(iso: string): Date {
  return new Date(iso.slice(0, 10) + 'T00:00:00.000Z');
}
export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
export function ymd(y: number, m1: number, d: number): Date {
  const last = new Date(Date.UTC(y, m1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m1 - 1, Math.min(d, last)));
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + Math.round(n) * DAY_MS);
}
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}
export function monthRange(year: number, month1: number) {
  return { gte: ymd(year, month1, 1), lt: new Date(Date.UTC(year, month1, 1)) };
}
export function ageOn(birth: Date, on: Date): number {
  let a = on.getUTCFullYear() - birth.getUTCFullYear();
  const md = (on.getUTCMonth() - birth.getUTCMonth()) * 100 + (on.getUTCDate() - birth.getUTCDate());
  if (md < 0) a--;
  return a;
}
/** weekday do sistema: 0 = segunda … 6 = domingo */
export function weekdayMon0(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/* ── Dinheiro ── */
export function num(v: Prisma.Decimal | number | string | null | undefined): number {
  return v == null ? 0 : Number(v);
}
export function money(v: number): number {
  return Math.round(v * 100) / 100;
}

export function initials(name: string): string {
  const w = name.trim().split(/\s+/);
  return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}

export const PAYMENT_LABEL = { PIX: 'Pix', CASH: 'Dinheiro', DEBIT: 'Cartão de débito', CREDIT: 'Cartão de crédito' } as const;

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export function hm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
export function brDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const s = d.toISOString();
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}
