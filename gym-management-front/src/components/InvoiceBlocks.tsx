import type { InvoiceRow, StudentInvoices } from '../api/types';
import { InvoicePill } from './ui';
import { br, brl } from '../lib/format';

export function InvoiceStats({ inv }: { inv: StudentInvoices }) {
  const s = inv.summary;
  const year = new Date().getFullYear();
  return (
    <div className="grid4">
      {[
        [`Pago em ${year}`, brl(s.paidYear), `${s.paidYearCount} mensalidade(s)`, undefined],
        ['Em aberto', brl(s.open), s.openCount ? `${s.openCount} mensalidade(s)` : 'Nada pendente', s.open ? 'var(--bad)' : undefined],
        ['Próximo vencimento', s.next ? br(s.next.dueDate) : '—', s.next ? brl(s.next.amount) : 'Nenhuma lançada', undefined],
        ['Mensalidade atual', brl(s.monthlyFee), `Vence todo dia ${String(s.dueDay).padStart(2, '0')}`, undefined],
      ].map(([k, v, sub, c]) => (
        <div key={k} className="card stat">
          <div className="stat-k">{k}</div>
          <div className="stat-v" style={{ color: c }}>{v}</div>
          <div className="stat-s">{sub}</div>
        </div>
      ))}
    </div>
  );
}

const COLS = '1.3fr 1fr 1fr 1fr 1.2fr 1.2fr 170px';
export function InvoicesTable({ inv, action, onPay }: { inv: StudentInvoices; action: string; onPay: (r: InvoiceRow) => void }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-h"><div className="card-t">Mensalidades<span style={{ fontSize: 12, color: 'var(--mute2)', fontWeight: 400 }}>{inv.rows.length}</span></div></div>
      <div className="thead" style={{ gridTemplateColumns: COLS }}>
        <div>Referência</div><div>Vencimento</div><div>Valor</div><div>Pago em</div><div>Forma</div><div>Status</div><div />
      </div>
      {inv.rows.map((m) => (
        <div key={m.id} className="trow" style={{ gridTemplateColumns: COLS, fontSize: 13 }}>
          <div className="row gap8">{m.ref}{m.manual && <span className="pill pill-mute" style={{ fontSize: 10.5, padding: '1px 6px' }}>Manual</span>}</div>
          <div className="num muted">{br(m.dueDate)}</div>
          <div className="num">{brl(m.amount)}</div>
          <div className="num muted">{m.paidAt ? br(m.paidAt) : '—'}</div>
          <div className="muted">{m.method ?? '—'}</div>
          <div><InvoicePill state={m.state} label={m.label} /></div>
          <div className="right">{m.canPay && <button className="btn btn-sm" onClick={() => onPay(m)}>{action}</button>}</div>
        </div>
      ))}
      {!inv.rows.length && <div className="empty">Nenhuma mensalidade lançada.</div>}
    </div>
  );
}
