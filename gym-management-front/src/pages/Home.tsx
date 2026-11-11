import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
import type { FinanceSummary } from '../api/types';
import { useApp } from '../auth/AppContext';
import { Avatar, ErrorBox, ICONS, Icon, Loading } from '../components/ui';
import { TransactionModal } from '../modals/basic';
import { StudentModal } from '../modals/StudentModal';
import { MONTHS, brl, firstName, greeting, longDate, pct, signedBrl } from '../lib/format';

interface Dash {
  date: string;
  birthdays: { today: { id: string; name: string; initials: string; sub: string }[]; month: { id: string; name: string; day: string; age: string; past: boolean; today: boolean }[] };
  finance: FinanceSummary & { invoices: { total: number; paid: number; late: number; dueToday: number; pctPaid: number; wPaid: number; wLate: number; wDue: number } };
  todayClasses: { id: string; name: string; color: string; instructor: string | null; start: string; end: string; count: number; state: 'done' | 'live' | 'next'; label: string }[];
  late: { count: number; total: number; rows: { id: string; name: string; initials: string; dueDate: string; amount: number; days: number }[] };
}
interface Onboarding {
  code: string; name: string; complete: boolean; done: number; total: number;
  steps: { key: string; title: string; sub: string; done: boolean; action: string | null; btn: string | null }[];
}

const CLASS_PILL = { done: 'pill-mute', live: 'pill-ok', next: 'pill-blue' } as const;
const ACTIONS: Record<string, string> = { disciplines: '/modalidades', settings: '/configuracoes', classes: '/turmas', students: '/alunos' };

export function HomePage() {
  const onb = useQuery({ queryKey: ['onboarding'], queryFn: () => get<Onboarding>('/tenant/onboarding') });
  if (onb.isLoading) return <Loading />;
  if (onb.error) return <ErrorBox error={onb.error} />;
  return onb.data!.complete ? <Dashboard /> : <OnboardingView o={onb.data!} />;
}

function OnboardingView({ o }: { o: Onboarding }) {
  const { me, toast } = useApp();
  const nav = useNavigate();
  const [newStudent, setNewStudent] = useState(false);
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--mute)' }}>{longDate()}</div>
        <h1 style={{ marginTop: 4 }}>Olá, {firstName(me!.name)}</h1>
        <div className="page-sub">{o.name} · conta criada, faltam alguns passos</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,7fr) minmax(0,4fr)', gap: 16 }}>
        <div className="card">
          <div className="card-h"><div className="card-t">Primeiros passos</div><span style={{ fontSize: 12.5, color: 'var(--mute)' }}>{o.done} de {o.total}</span></div>
          {o.steps.map((s, i) => (
            <div key={s.key} className="row gap12" style={{ padding: '14px 18px', borderBottom: i < o.steps.length - 1 ? '1px solid var(--line2)' : undefined }}>
              <div className="av" style={{ width: 26, height: 26, fontSize: 12, background: s.done ? 'rgba(61,214,140,0.14)' : 'var(--btn)', color: s.done ? 'var(--ok)' : 'var(--mute)' }}>
                {s.done ? <Icon d={ICONS.check} size={13} width={2.4} /> : i + 1}
              </div>
              <div className="grow">
                <div style={{ fontSize: 13.5, fontWeight: 500, textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--mute)' : undefined }}>{s.title}</div>
                <div className="ellipsis" style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 2 }}>{s.sub}</div>
              </div>
              {s.btn && s.action && (
                <button className={'btn btn-sm' + (s.done ? ' btn-ghost' : '')} onClick={() => (s.key === 'students' ? setNewStudent(true) : nav(ACTIONS[s.action!]))}>{s.btn}</button>
              )}
            </div>
          ))}
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-h"><div className="card-t">Acesso dos alunos</div></div>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
              Os alunos criam a conta em <span style={{ color: 'var(--text)' }}>Criar conta › Sou aluno</span>, com este código e o e-mail da matrícula.
            </div>
            <div className="row gap8" style={{ marginTop: 14 }}>
              <span className="mono grow" style={{ fontSize: 15, letterSpacing: '0.06em', padding: '9px 12px', borderRadius: 8, background: 'var(--sunk)', border: '1px solid var(--bd2)' }}>{o.code}</span>
              <button className="btn" onClick={() => { navigator.clipboard?.writeText(o.code).catch(() => undefined); toast(`Código copiado: ${o.code}`); }}>Copiar</button>
            </div>
          </div>
        </div>
      </div>
      {newStudent && <StudentModal onClose={() => setNewStudent(false)} />}
    </div>
  );
}

function Dashboard() {
  const { me } = useApp();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dash>('/dashboard'), refetchInterval: 5 * 60_000 });
  const [modal, setModal] = useState<null | 'tx' | 'student'>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const f = d.finance;
  const month = MONTHS[Number(d.date.slice(5, 7)) - 1];
  const open = (id: string) => nav(`/alunos/${id}`);

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <div style={{ fontSize: 13, color: 'var(--mute)' }}>{longDate()}</div>
          <h1 style={{ marginTop: 4 }}>{greeting()}, {firstName(me!.name)}</h1>
        </div>
        <div className="row gap8">
          <button className="btn" onClick={() => setModal('tx')}>Novo lançamento</button>
          <button className="btn btn-primary" onClick={() => setModal('student')}><Icon d={ICONS.plus} size={14} width={2.2} />Novo aluno</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,5fr) minmax(0,7fr)', gap: 16 }}>
        <div className="card col gap12" style={{ background: 'linear-gradient(180deg,rgba(217,164,65,0.09),rgba(217,164,65,0) 55%),var(--card)', borderColor: 'rgba(217,164,65,0.26)', padding: 18 }}>
          <div className="row between">
            <div className="card-t"><Icon d={ICONS.cake} stroke="var(--gold)" />Aniversariantes</div>
            {d.birthdays.today.length > 0 && <span className="pill pill-gold" style={{ fontWeight: 600 }}>{d.birthdays.today.length} hoje</span>}
          </div>
          {d.birthdays.today.length ? (
            <div className="col gap8">
              {d.birthdays.today.map((b) => (
                <div key={b.id} className="row gap12" style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(217,164,65,0.06)', border: '1px solid rgba(217,164,65,0.16)' }}>
                  <Avatar name={b.name} initials={b.initials} size={42} ring="var(--gold)" />
                  <div className="grow">
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{b.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 2 }}>{b.sub}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => open(b.id)}>Ver ficha</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--mute)' }}>Nenhum aniversariante hoje.</div>
          )}
          <div style={{ fontSize: 12, color: 'var(--mute)', fontWeight: 500, marginTop: 2 }}>Em {month.toLowerCase()}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '4px 18px' }}>
            {d.birthdays.month.map((b) => (
              <div key={b.id} className="row gap10" style={{ height: 30, fontSize: 13, opacity: b.past ? 0.5 : 1, cursor: 'pointer' }} onClick={() => open(b.id)}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--gold)', width: 40 }}>{b.day}</span>
                <span className="ellipsis grow">{b.name}</span>
                <span style={{ fontSize: 12, color: 'var(--mute2)' }}>{b.age}</span>
              </div>
            ))}
            {!d.birthdays.month.length && <span style={{ fontSize: 13, color: 'var(--mute2)' }}>Ninguém faz aniversário este mês.</span>}
          </div>
        </div>

        <div className="card col">
          <div className="row between" style={{ padding: '16px 18px 0' }}>
            <div className="card-t">Financeiro <span style={{ color: 'var(--mute2)', fontWeight: 400 }}>· {month} {d.date.slice(0, 4)}</span></div>
            <div className="card-link" onClick={() => nav('/financeiro')}>Ver financeiro<Icon d={ICONS.chevR} size={13} width={2} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', padding: '18px 0 6px' }}>
            {[
              ['Entradas', brl(f.income), f.incomeOpen > 0 ? `${brl(f.incomeOpen)} a receber` : 'Tudo recebido', 'var(--ok)', undefined],
              ['Saídas', brl(f.expense), f.expenseOpen > 0 ? `${brl(f.expenseOpen)} a pagar` : 'Tudo pago', 'var(--mute)', undefined],
              ['Saldo', signedBrl(f.balance), 'Entradas − saídas pagas', null, f.balance >= 0 ? 'var(--ok)' : 'var(--bad)'],
              ['A receber', brl(f.incomeOpen), `Previsto: ${signedBrl(f.forecast)}`, null, 'var(--warn)'],
            ].map(([k, v, s, dot, c], i) => (
              <div key={k as string} style={{ padding: '0 16px', borderRight: i < 3 ? '1px solid var(--line)' : undefined, minWidth: 0 }}>
                <div className="stat-k">{dot && <span className="dot" style={{ background: dot as string }} />}{k}</div>
                <div className="stat-v" style={{ fontSize: 19, color: (c as string) ?? undefined }}>{v}</div>
                <div className="stat-s ellipsis">{s}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '14px 18px 18px', marginTop: 'auto' }}>
            <div className="row between" style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 8 }}>
              <span>Mensalidades recebidas no mês</span>
              <span className="num" style={{ color: 'var(--text)' }}>{pct(f.invoices.pctPaid)} · {f.invoices.paid}/{f.invoices.total}</span>
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', background: 'var(--line)', gap: 2 }}>
              <div style={{ width: pct(f.invoices.wPaid), background: 'var(--ok)' }} />
              <div style={{ width: pct(f.invoices.wLate), background: 'var(--brand)' }} />
              <div style={{ width: pct(f.invoices.wDue), background: 'var(--warn)' }} />
            </div>
            <div className="row gap16" style={{ marginTop: 10, fontSize: 12, color: 'var(--mute)' }}>
              <span className="row gap6"><span className="sq" style={{ background: 'var(--ok)' }} />Pagas</span>
              <span className="row gap6"><span className="sq" style={{ background: 'var(--brand)' }} />Atrasadas</span>
              <span className="row gap6"><span className="sq" style={{ background: 'var(--warn)' }} />Vencem hoje</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-h"><div className="card-t">Turmas de hoje</div><div className="card-link" onClick={() => nav('/turmas')}>Calendário</div></div>
          <div style={{ padding: '6px 0' }}>
            {d.todayClasses.map((c) => (
              <div key={c.id} className="row gap12" style={{ padding: '10px 18px', opacity: c.state === 'done' ? 0.5 : 1 }}>
                <div className="mono" style={{ width: 44, fontSize: 12.5, lineHeight: 1.35 }}><div>{c.start}</div><div style={{ color: 'var(--mute2)' }}>{c.end}</div></div>
                <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: c.color }} />
                <div className="grow">
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{c.instructor ?? 'Sem professor'} · {c.count} alunos</div>
                </div>
                <span className={'pill ' + CLASS_PILL[c.state]}>{c.label}</span>
              </div>
            ))}
            {!d.todayClasses.length && <div className="empty" style={{ padding: 32 }}>Sem turmas hoje.</div>}
          </div>
        </div>

        <div className="card col">
          <div className="card-h">
            <div className="card-t">Mensalidades atrasadas{d.late.count > 0 && <span className="pill pill-bad" style={{ fontWeight: 600, padding: '2px 7px' }}>{d.late.count}</span>}</div>
            <div className="card-link" onClick={() => nav('/alunos?finance=late')}>Ver todas</div>
          </div>
          <div style={{ padding: '6px 0', flex: 1 }}>
            {d.late.rows.map((l) => (
              <div key={l.id} className="row gap12 trow click" style={{ display: 'flex', minHeight: 46, padding: '8px 18px', borderBottom: 'none' }} onClick={() => nav(`/alunos/${l.id}/financeiro`)}>
                <Avatar name={l.name} initials={l.initials} />
                <div className="grow">
                  <div className="ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{l.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 1 }}>Venceu em {l.dueDate}</div>
                </div>
                <div className="right">
                  <div className="num" style={{ fontSize: 13.5, fontWeight: 500 }}>{brl(l.amount)}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--bad)', marginTop: 1 }}>{l.days} dias</div>
                </div>
              </div>
            ))}
            {!d.late.rows.length && <div className="empty" style={{ padding: 32 }}>Nenhuma mensalidade em atraso.</div>}
          </div>
          <div className="card-foot"><span>Total em atraso</span><span className="num" style={{ color: 'var(--bad)', fontWeight: 600 }}>{brl(d.late.total)}</span></div>
        </div>
      </div>

      {modal === 'tx' && <TransactionModal onClose={() => setModal(null)} />}
      {modal === 'student' && <StudentModal onClose={() => setModal(null)} />}
    </div>
  );
}
