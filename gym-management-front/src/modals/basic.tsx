import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post, put } from '../api/client';
import type { PaymentMethod, StudentDetail } from '../api/types';
import { Alert, Belt, DateInput, Field, Modal, Seg } from '../components/ui';
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
    if (!date) return m.setErr('Informe uma data válida (dd/mm/aaaa).');
    if (await m.run(() => post('/finance/transactions', { type, description, amount, date, category, status }), 'Lançamento salvo')) onClose();
  };
  return (
    <Modal title="Novo lançamento" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>Salvar lançamento</button></>}>
      <Seg large value={type} onChange={(v) => { setType(v); setCat(CATS[v][0]); }} options={[{ v: 'INCOME', label: 'Entrada' }, { v: 'EXPENSE', label: 'Saída' }]} />
      <Field label="Descrição"><input className="input" value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Aluguel de novembro" autoFocus /></Field>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Valor (R$)"><input className="input num" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Data"><DateInput value={date} onChange={setDate} /></Field>
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

/** Pagamento de mensalidade; com `url`, paga outra coisa (ex.: cobrança da família). */
export function PayInvoiceModal({ invoice, url, onClose }: { invoice: { id: string; ref: string; amount: number; name?: string }; url?: string; onClose: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [paidAt, setPaidAt] = useState(todayISO());
  const m = useMutate();
  const save = async () => {
    if (!paidAt) return m.setErr('Informe uma data válida (dd/mm/aaaa).');
    if (await m.run(() => post(url ?? `/invoices/${invoice.id}/pay`, { method, paidAt }), `Pagamento de ${invoice.ref} registrado`)) onClose();
  };
  return (
    <Modal title="Registrar pagamento" sub={`${invoice.name ? invoice.name + ' · ' : ''}${invoice.ref} · ${brl(invoice.amount)}`} width={420} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>Confirmar pagamento</button></>}>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Pago em"><DateInput value={paidAt} onChange={setPaidAt} /></Field>
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
    if (!venc || (paid && !paidAt)) return m.setErr('Informe uma data válida (dd/mm/aaaa).');
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
        <Field label="Vencimento"><DateInput value={venc} onChange={setVenc} /></Field>
      </div>
      {paid && (
        <div className="grid2" style={{ gap: 12 }}>
          <Field label="Pago em"><DateInput value={paidAt} onChange={setPaidAt} /></Field>
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

type BeltB = Parameters<typeof Belt>[0]['b'];
interface GradOverview {
  rows: { studentId: string; name: string; belt: { label: string }; canPromote: boolean }[];
  discipline: { name: string } | null;
}
interface Preview {
  from: BeltB;
  to: BeltB | null;
  instructor: string | null;
  date: string;
  current: { levelOrder: number; degree: number; levelSince: string };
  levels: (BeltB & { order: number; maxDegree: number })[];
}

/** Faixa de um nível com N graus (mesma regra do servidor para o rótulo). */
const withDegree = (l: Preview['levels'][number], degree: number): BeltB => ({
  ...l, stripes: l.hasBar ? degree : 0, label: degree > 0 ? `${l.name} · ${degree} grau${degree > 1 ? 's' : ''}` : l.name,
});

/**
 * Graduação do aluno numa modalidade.
 * - "Próxima graduação": avança um passo (fluxo normal).
 * - "Escolher graduação": qualquer faixa/grau, inclusive para baixo. Pode
 *   registrar como graduação (entra no histórico) ou só corrigir o cadastro.
 */
export function GraduationModal({ disciplineId, studentId, free, onClose }: { disciplineId: string; studentId?: string; free?: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'next' | 'free'>(free ? 'free' : 'next');
  const list = useQuery({ queryKey: ['graduation', disciplineId], queryFn: () => get<GradOverview>('/graduation', { disciplineId }) });
  const rows = list.data?.rows ?? [];
  const opts = tab === 'next' ? rows.filter((r) => r.canPromote) : rows;
  const [sid, setSid] = useState(studentId ?? '');
  const current = opts.some((o) => o.studentId === sid) ? sid : opts[0]?.studentId || '';
  const pv = useQuery({
    queryKey: ['grad-preview', current, disciplineId],
    queryFn: () => get<Preview>('/graduation/preview', { studentId: current, disciplineId }),
    enabled: !!current,
  });
  const p = pv.data;
  // escolha livre: começa na graduação atual do aluno
  const [pick, setPick] = useState<{ for: string; level: number; degree: number; since: string } | null>(null);
  const sel = pick && pick.for === current ? pick : p ? { for: current, level: p.current.levelOrder, degree: p.current.degree, since: p.current.levelSince } : null;
  const [kind, setKind] = useState<'correction' | 'promotion'>('correction');
  const [date, setDate] = useState(todayISO());
  const m = useMutate();
  const name = rows.find((o) => o.studentId === current)?.name ?? 'Aluno';
  const lvl = p?.levels.find((l) => l.order === sel?.level);
  const target = tab === 'next' ? p?.to ?? null : lvl && sel ? withDegree(lvl, Math.min(sel.degree, lvl.maxDegree)) : null;
  const unchanged = tab === 'free' && !!p && !!sel && sel.level === p.current.levelOrder && sel.degree === p.current.degree && (kind === 'promotion' || sel.since === p.current.levelSince);

  const confirm = async () => {
    if (tab === 'next') {
      if (await m.run(() => post<{ belt: { label: string } }>('/graduation/promote', { studentId: current, disciplineId }), (r) => `${name} graduado: ${r.belt.label}`)) onClose();
      return;
    }
    if (!sel || !lvl) return;
    if (kind === 'promotion' ? !date : !sel.since) return m.setErr('Informe uma data válida (dd/mm/aaaa).');
    const body = {
      studentId: current, disciplineId, levelOrder: sel.level, degree: Math.min(sel.degree, lvl.maxDegree), mode: kind,
      ...(kind === 'promotion' ? { date } : sel.since !== p!.current.levelSince ? { levelSince: sel.since } : {}),
    };
    const ok = (r: { belt: { label: string } }) => (kind === 'promotion' ? `${name} graduado: ${r.belt.label}` : `Graduação de ${name} corrigida: ${r.belt.label}`);
    if (await m.run(() => put<{ belt: { label: string } }>('/graduation/rank', body), ok)) onClose();
  };

  return (
    <Modal title={tab === 'next' ? 'Registrar graduação' : 'Alterar graduação'} width={tab === 'free' ? 560 : 480} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy || !target || unchanged} onClick={confirm}>{tab === 'next' || kind === 'promotion' ? 'Confirmar graduação' : 'Salvar correção'}</button></>}>
      <Seg value={tab} onChange={setTab} options={[{ v: 'next', label: 'Próxima graduação' }, { v: 'free', label: 'Escolher graduação' }]} />
      <Field label={`Aluno · ${list.data?.discipline?.name ?? ''}`}>
        <select className="input" value={current} onChange={(e) => setSid(e.target.value)}>
          {opts.map((o) => <option key={o.studentId} value={o.studentId}>{o.name} — {o.belt.label}</option>)}
        </select>
      </Field>
      {p && (
        <>
          <div className="grid2" style={{ gap: 12 }}>
            {([['Atual', p.from], ['Nova', target]] as const).map(([k, b]) => (
              <div key={k} style={{ padding: 14, borderRadius: 10, background: 'var(--sunk)', border: '1px solid var(--bd)' }}>
                <div style={{ fontSize: 12, color: 'var(--mute)' }}>{k}</div>
                {b ? (
                  <>
                    <div style={{ margin: '10px 0 8px' }}><Belt b={b} w={64} h={14} /></div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{b.label}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, marginTop: 10 }}>Graduação máxima</div>
                )}
              </div>
            ))}
          </div>
          {tab === 'next' ? (
            <div className="grid2" style={{ gap: 12 }}>
              <Field label="Data"><div style={{ fontSize: 13.5 }}>{p.date}</div></Field>
              <Field label="Professor"><div style={{ fontSize: 13.5 }}>{p.instructor ?? '—'}</div></Field>
            </div>
          ) : sel && (
            <>
              <Field label="Faixa / nível">
                <div className="row wrap gap6">
                  {p.levels.map((l) => (
                    <div key={l.order} className={'chip' + (l.order === sel.level ? ' on' : '')}
                      style={l.order === sel.level ? { borderColor: 'var(--text)' } : undefined}
                      onClick={() => setPick({ ...sel, level: l.order, degree: Math.min(sel.degree, l.maxDegree) })}>
                      <Belt b={l} w={26} h={8} />{l.name}
                    </div>
                  ))}
                </div>
              </Field>
              {!!lvl?.maxDegree && (
                <Field label="Graus">
                  <Seg value={String(Math.min(sel.degree, lvl.maxDegree))} onChange={(v) => setPick({ ...sel, degree: Number(v) })}
                    options={Array.from({ length: lvl.maxDegree + 1 }, (_, i) => ({ v: String(i), label: String(i) }))} />
                </Field>
              )}
              <Field label="Tipo" hint={kind === 'correction' ? 'Só corrige o cadastro: o histórico não muda.' : 'Entra no histórico e zera a contagem desde a última graduação.'}>
                <Seg value={kind} onChange={setKind} options={[{ v: 'correction', label: 'Correção de cadastro' }, { v: 'promotion', label: 'Graduação' }]} />
              </Field>
              {kind === 'promotion' ? (
                <div className="grid2" style={{ gap: 12 }}>
                  <Field label="Data da graduação"><DateInput value={date} onChange={setDate} /></Field>
                  <Field label="Professor"><div style={{ fontSize: 13.5, paddingTop: 8 }}>{p.instructor ?? '—'}</div></Field>
                </div>
              ) : (
                <Field label="Na faixa atual desde" hint="Usado no tempo de faixa. Deixe como está se não souber.">
                  <DateInput value={sel.since} onChange={(v) => setPick({ ...sel, since: v })} style={{ maxWidth: 200 }} />
                </Field>
              )}
            </>
          )}
        </>
      )}
      {!opts.length && list.data && <div className="empty">{tab === 'next' ? 'Nenhum aluno com próxima graduação.' : 'Nenhum aluno nesta modalidade.'}</div>}
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
