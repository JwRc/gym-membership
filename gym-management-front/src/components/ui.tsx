import { CSSProperties, ReactNode, useEffect } from 'react';
import { useApp } from '../auth/AppContext';
import { avatarColors } from '../lib/theme';
import type { Belt as BeltT, Finance, StudentStatus } from '../api/types';

export const ICONS = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  alunos: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  turmas: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  grad: 'M2 9.5h20v5H2zM10 9.5l-3 10M14 9.5l3 10M10 9.5h4v5h-4z',
  fin: 'M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M21 12h-5a2 2 0 0 0 0 4h5zM3 7h16a2 2 0 0 1 2 2v3',
  loja: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  mods: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  config: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  chevR: 'M9 18l6-6-6-6',
  chevL: 'M15 18l-6-6 6-6',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  close: 'M18 6 6 18M6 6l12 12',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  warn: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  cake: 'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01',
  check: 'M20 6 9 17l-5-5',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
} as const;

export function Icon({ d, size = 16, stroke = 'currentColor', width = 1.8, style }: { d: string; size?: number; stroke?: string; width?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      <path d={d} />
    </svg>
  );
}

export function Avatar({ name, initials, size = 30, ring, onClick }: { name: string; initials?: string; size?: number; ring?: string; onClick?: () => void }) {
  const { theme } = useApp();
  const c = avatarColors(name, theme);
  const ini = initials ?? (name.split(' ')[0][0] + (name.split(' ').at(-1)?.[0] ?? '')).toUpperCase();
  return (
    <div
      className="av"
      title={name}
      onClick={onClick}
      style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size * 0.38, cursor: onClick ? 'pointer' : undefined, boxShadow: ring ? `0 0 0 2px var(--card),0 0 0 3.5px ${ring}` : undefined }}
    >
      {ini}
    </div>
  );
}

/** Faixa: cor do nível + ponteira com graus (BJJ). */
export function Belt({ b, w = 30, h = 9 }: { b: BeltT; w?: number; h?: number }) {
  return (
    <div className="belt" style={{ width: w, height: h, background: b.color }} title={b.label}>
      {b.hasBar && (
        <div className="belt-bar" style={{ width: Math.round(w * 0.37), background: b.bar }}>
          {Array.from({ length: b.stripes }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS: Record<StudentStatus, [string, string]> = { ACTIVE: ['Ativo', 'pill-ok'], INACTIVE: ['Inativo', 'pill-gray'], LOCKED: ['Trancado', 'pill-warn'] };
export const StatusPill = ({ s }: { s: StudentStatus }) => <span className={'pill ' + STATUS[s][1]}>{STATUS[s][0]}</span>;

const FIN: Record<Finance['key'], string> = { ok: 'pill-ok', today: 'pill-warn', late: 'pill-bad', exempt: 'pill-gray', none: 'pill-mute' };
export const FinancePill = ({ f }: { f: Finance }) => <span className={'pill ' + FIN[f.key]}>{f.label}</span>;

const INV: Record<string, string> = { paid: 'pill-ok', overdue: 'pill-bad', grace: 'pill-warn', today: 'pill-warn', upcoming: 'pill-mute', exempt: 'pill-gray' };
export const InvoicePill = ({ state, label }: { state: string; label: string }) => <span className={'pill ' + (INV[state] ?? 'pill-mute')}>{label}</span>;

export function Seg<T extends string>({ options, value, onChange, large }: { options: { v: T; label: ReactNode; extra?: ReactNode }[]; value: T; onChange: (v: T) => void; large?: boolean }) {
  return (
    <div className={large ? 'seg-lg' : 'seg'}>
      {options.map((o) => (
        <div key={o.v} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
          {o.extra}
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.min(1, value ?? 0) * 100}%`, background: color }} />
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="field-l">{label}</div>
      {children}
      {hint && <div style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

export function Alert({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return (
    <div className={'alert' + (warn ? ' alert-warn' : '')}>
      <Icon d={ICONS.warn} size={14} stroke={warn ? 'var(--warn)' : 'var(--bad)'} width={2} style={{ marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}

export function Modal({ title, sub, onClose, children, footer, width = 480 }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer: ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="ovl" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-h">
          <div>
            <div className="modal-t">{title}</div>
            {sub && <div style={{ fontSize: 12.5, color: 'var(--mute)', marginTop: 3 }}>{sub}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon d={ICONS.close} size={15} />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        <div className="modal-f">{footer}</div>
      </div>
    </div>
  );
}

export const Loading = () => (
  <div className="loading">
    <div className="spinner" />
  </div>
);

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="page">
      <Alert>{(error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não foi possível carregar os dados.'}</Alert>
    </div>
  );
}
