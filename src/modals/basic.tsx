import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '../api/client';
import type { PaymentMethod, StudentDetail } from '../api/types';
import { Alert, Belt, Field, Modal, Seg } from '../components/ui';
import { MONTHS, PAYMENT_OPTIONS, brl, moneyInput, parseMoney, todayISO } from '../lib/format';
import { useMutate } from './useMutate';

const CATS = {
  INCOME: ['Mensalidades', 'Matrículas', 'Aulas particulares', 'Eventos', 'Loja'],
  EXPENSE: ['Aluguel', 'Custo de produtos', 'Folha de pagamento', 'Contas de consumo', 'Manutenção', 'Equipamentos', 'Serviços', 'Marketing'],
};

export function TransactionModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [description, setDesc] = useState('');
  const [valor, setValor] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCat] = useState(CATS.EXPENSE[0]);
  const [status, setStatus] = useState<'PENDING' | 'PAID'>('PENDING');
  const m = useMutate();
  const save = async () => {
    const amount = parseMoney(valor);
    if (!(amount > 0)) return m.setErr('Informe um valor válido.');
    if (await m.run(() => post('/finance/transactions', { type, description, amount, date, category, status }), 'Lançamento salvo')) onClose();
  };
  return (
    <Modal title="Novo lançamento" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>Salvar lançamento</button></>}>
      <Seg large value={type} onChange={(v) => { setType(v); setCat(CATS[v][0]); }} options={[{ v: 'INCOME', label: 'Entrada' }, { v: 'EXPENSE', label: 'Saída' }]} />
      <Field label="Descrição"><input className="input" value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Aluguel de novembro" autoFocus /></Field>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Valor (R$)"><input className="input num" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Categoria">
          <select className="input" value={category} onChange={(e) => setCat(e.target.value)}>{CATS[type].map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as 'PENDING' | 'PAID')}><option value="PENDING">Pendente</option><option value="PAID">Pago</option></select>
        </Field>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}

export function PayInvoiceModal({ invoice, onClose }: { invoice: { id: string; ref: string; amount: number; name?: string }; onClose: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [paidAt, setPaidAt] = useState(todayISO());
  const m = useMutate();
  const save = async () => {
    if (await m.run(() => post(`/invoices/${invoice.id}/pay`, { method, paidAt }), `Pagamento de ${invoice.ref} registrado`)) onClose();
  };
  return (
    <Modal title="Registrar pagamento" sub={`${invoice.name ? invoice.name + ' · ' : ''}${invoice.ref} · ${brl(invoice.amount)}`} width={420} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>Confirmar pagamento</button></>}>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Pago em"><input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
        <Field label="Forma de pagamento">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
        </Field>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}

export function LaunchInvoiceModal({ student, onClose }: { student: Pick<StudentDetail, 'id' | 'name' | 'monthlyFee' | 'dueDay'>; onClose: () => void }) {
  const now = new Date();
  const opts = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 2 + i, 1);
    return { v: `${d.getFullYear()}-${d.getMonth() + 1}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const [ref, setRef] = useState(opts[2].v);
  const [repeat, setRepeat] = useState(1);
  const [paid, setPaid] = useState(false);
  const [valor, setValor] = useState(moneyInput(student.monthlyFee));
  const sel = opts.find((o) => o.v === ref)!;
  const dueFor = (y: number, mo: number) => {
    const last = new Date(y, mo, 0).getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(Math.min(student.dueDay, last)).padStart(2, '0')}`;
  };
  const [venc, setVenc] = useState(dueFor(sel.y, sel.m));
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const m = useMutate();
  const amount = parseMoney(valor);
  const save = async () => {
    if (!(amount >= 0)) return m.setErr('Informe um valor válido.');
    const r = await m.run(
      () => post<{ created: number; skipped: string[] }>(`/students/${student.id}/invoices`, { year: sel.y, month: sel.m, repeat, amount, dueDate: venc, paid, ...(paid ? { paidAt, method } : {}) }),
      (r) => `${r.created} mensalidade(s) lançada(s)` + (r.skipped.length ? ` · já existiam: ${r.skipped.join(', ')}` : ''),
    );
    if (r) onClose();
  };
  return (
    <Modal title="Lançar mensalidade" sub={student.name} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>Lançar</button></>}>
      <Seg large value={paid ? 'pago' : 'aberto'} onChange={(v) => setPaid(v === 'pago')} options={[{ v: 'aberto', label: 'Em aberto' }, { v: 'pago', label: 'Já pago' }]} />
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Referência">
          <select className="input" value={ref} onChange={(e) => { setRef(e.target.value); const o = opts.find((x) => x.v === e.target.value)!; setVenc(dueFor(o.y, o.m)); }}>
            {opts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Repetir">
          <select className="input" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
            <option value={1}>Só este mês</option><option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option>
          </select>
        </Field>
      </div>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Valor (R$)"><input className="input num" value={valor} onChange={(e) => setValor(e.target.value)} /></Field>
        <Field label="Vencimento"><input className="input" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></Field>
      </div>
      {paid && (
        <div className="grid2" style={{ gap: 12 }}>
          <Field label="Pago em"><input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
          <Field label="Forma de pagamento">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
          </Field>
        </div>
      )}
      <div className="row between" style={{ fontSize: 13, color: 'var(--mute)', paddingTop: 4 }}>
        <span>Total lançado</span>
        <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>{brl((amount || 0) * repeat)}</span>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}

interface GradOverview {
  rows: { studentId: string; name: string; belt: { label: string }; eligible: boolean; canPromote: boolean }[];
  discipline: { name: string } | null;
}
interface Preview {
  from: Parameters<typeof Belt>[0]['b'];
  to: Parameters<typeof Belt>[0]['b'] | null;
  instructor: string | null;
  date: string;
  eligible: boolean;
  info: string;
}

export function GraduationModal({ disciplineId, studentId, onClose }: { disciplineId: string; studentId?: string; onClose: () => void }) {
  const list = useQuery({ queryKey: ['graduation', disciplineId, false], queryFn: () => get<GradOverview>('/graduation', { disciplineId }) });
  const opts = (list.data?.rows ?? []).filter((r) => r.canPromote);
  const [sid, setSid] = useState(studentId ?? '');
  const current = sid || opts[0]?.studentId || '';
  const pv = useQuery({
    queryKey: ['grad-preview', current, disciplineId],
    queryFn: () => get<Preview>('/graduation/preview', { studentId: current, disciplineId }),
    enabled: !!current,
  });
  const m = useMutate();
  const confirm = async () => {
    const name = opts.find((o) => o.studentId === current)?.name ?? 'Aluno';
    if (await m.run(() => post<{ belt: { label: string } }>('/graduation/promote', { studentId: current, disciplineId }), (r) => `${name} graduado: ${r.belt.label}`)) onClose();
  };
  const p = pv.data;
  return (
    <Modal title="Registrar graduação" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy || !p?.to} onClick={confirm}>Confirmar graduação</button></>}>
      <Field label={`Aluno · ${list.data?.discipline?.name ?? ''}`}>
        <select className="input" value={current} onChange={(e) => setSid(e.target.value)}>
          {opts.map((o) => <option key={o.studentId} value={o.studentId}>{o.name} — {o.belt.label}{o.eligible ? ' · apto' : ''}</option>)}
        </select>
      </Field>
      {p && (
        <>
          <div className="grid2" style={{ gap: 12 }}>
            {[['Atual', p.from], ['Nova', p.to]].map(([k, b]) => (
              <div key={k as string} style={{ padding: 14, borderRadius: 10, background: 'var(--sunk)', border: '1px solid var(--bd)' }}>
                <div style={{ fontSize: 12, color: 'var(--mute)' }}>{k as string}</div>
                {b ? (
                  <>
                    <div style={{ margin: '10px 0 8px' }}><Belt b={b as Preview['from']} w={64} h={14} /></div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{(b as Preview['from']).label}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, marginTop: 10 }}>Graduação máxima</div>
                )}
              </div>
            ))}
          </div>
          <div className="grid2" style={{ gap: 12 }}>
            <Field label="Data"><div style={{ fontSize: 13.5 }}>{p.date}</div></Field>
            <Field label="Professor"><div style={{ fontSize: 13.5 }}>{p.instructor ?? '—'}</div></Field>
          </div>
          {p.eligible ? <div style={{ fontSize: 12.5, color: 'var(--mute)' }}>{p.info}</div> : <Alert warn>{p.info}</Alert>}
        </>
      )}
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
