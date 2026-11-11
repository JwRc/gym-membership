import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
import type { FinanceRowT, FinanceSummary } from '../api/types';
import { ErrorBox, ICONS, Icon, Loading, Progress, Seg } from '../components/ui';
import { TransactionModal } from '../modals/basic';
import { MONTHS, MONTHS_SHORT, br, brl, signedBrl } from '../lib/format';

interface Resp {
  year: number; month: number; summary: FinanceSummary; rows: FinanceRowT[]; categories: string[];
  upcoming: FinanceRowT[]; expensesByCategory: { category: string; amount: number; pct: number }[];
}
const COLS = '90px minmax(240px,2.4fr) minmax(140px,1.2fr) 130px 110px';
const ST = { paid: ['Pago', 'pill-ok'], pending: ['Pendente', 'pill-warn'], overdue: ['Atrasado', 'pill-bad'] } as const;

export function FinancePage() {
  const nav = useNavigate();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [type, setType] = useState<'all' | 'INCOME' | 'EXPENSE'>('all');
  const [category, setCategory] = useState('Todas');
  const [modal, setModal] = useState(false);
  const q = useQuery({
    queryKey: ['finance', ym.y, ym.m, type, category],
    queryFn: () => get<Resp>('/finance', { year: ym.y, month: ym.m, type, category }),
    placeholderData: keepPreviousData,
  });
  const shift = (k: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m - 1 + k) / 12), m: ((((m - 1 + k) % 12) + 12) % 12) + 1 }));
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const s = d.summary;

  return (
    <div className="page">
      <div className="page-h">
        <div><h1>Financeiro</h1><div className="page-sub">Entradas e saídas, realizadas e previstas</div></div>
        <div className="row gap8">
          <div className="row" style={{ height: 34, borderRadius: 8, border: '1px solid var(--bd2)', background: 'var(--btn)' }}>
            <button className="icon-btn" style={{ height: 32 }} onClick={() => shift(-1)}><Icon d={ICONS.chevL} size={14} width={2} /></button>
            <div style={{ fontSize: 13, fontWeight: 500, minWidth: 128, textAlign: 'center' }}>{MONTHS[ym.m - 1]} {ym.y}</div>
            <button className="icon-btn" style={{ height: 32 }} onClick={() => shift(1)}><Icon d={ICONS.chevR} size={14} width={2} /></button>
          </div>
          <button className="btn btn-primary" onClick={() => setModal(true)}><Icon d={ICONS.plus} size={14} width={2.2} />Novo lançamento</button>
        </div>
      </div>
      <div className="grid4">
        <div className="card stat"><div className="stat-k"><span className="dot" style={{ background: 'var(--ok)' }} />Entradas recebidas</div><div className="stat-v">{brl(s.income)}</div><div className="stat-s">{s.incomeOpen > 0 ? `${brl(s.incomeOpen)} a receber` : 'Tudo recebido'}</div></div>
        <div className="card stat"><div className="stat-k"><span className="dot" style={{ background: 'var(--mute)' }} />Saídas pagas</div><div className="stat-v">{brl(s.expense)}</div><div className="stat-s">{s.expenseOpen > 0 ? `${brl(s.expenseOpen)} a pagar` : 'Tudo pago'}</div></div>
        <div className="card stat"><div className="stat-k">Saldo realizado</div><div className="stat-v" style={{ color: s.balance >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{signedBrl(s.balance)}</div><div className="stat-s">Entradas − saídas pagas</div></div>
        <div className="card stat"><div className="stat-k">Previsto para o mês</div><div className="stat-v">{signedBrl(s.forecast)}</div><div className="stat-s">{brl(s.incomeAll)} entram · {brl(s.expenseAll)} saem</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="row gap10" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
            <Seg value={type} onChange={setType} options={[{ v: 'all', label: 'Todos' }, { v: 'INCOME', label: 'Entradas' }, { v: 'EXPENSE', label: 'Saídas' }]} />
            <select className="input" style={{ width: 'auto', height: 32 }} value={category} onChange={(e) => setCategory(e.target.value)}>{d.categories.map((c) => <option key={c}>{c}</option>)}</select>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--mute2)' }}>{d.rows.length} lançamentos</span>
          </div>
          <div className="thead" style={{ gridTemplateColumns: COLS }}><div>Data</div><div>Descrição</div><div>Categoria</div><div className="right">Valor</div><div>Status</div></div>
          {d.rows.map((r) => (
            <div key={r.id} className={'trow' + (r.studentId ? ' click' : '')} style={{ gridTemplateColumns: COLS }} onClick={() => r.studentId && nav(`/alunos/${r.studentId}/financeiro`)}>
              <div className="num" style={{ fontSize: 12.5, color: 'var(--mute)' }}>{br(r.date).slice(0, 5)}</div>
              <div className="row gap10" style={{ minWidth: 0 }}>
                <div style={{ width: 3, height: 26, borderRadius: 2, background: r.type === 'INCOME' ? 'var(--ok)' : 'var(--sep)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontSize: 13.5 }}>{r.description}</div>{r.note && <div className="ellipsis" style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 1 }}>{r.note}</div>}</div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--mute)' }}>{r.category}</div>
              <div className="right num" style={{ fontSize: 13.5, fontWeight: 500, color: r.type === 'INCOME' ? 'var(--ok)' : undefined }}>{r.type === 'INCOME' ? '+ ' : '− '}{brl(r.amount)}</div>
              <div><span className={'pill ' + ST[r.status][1]}>{ST[r.status][0]}</span></div>
            </div>
          ))}
          {!d.rows.length && <div className="empty">Nenhum lançamento neste mês.</div>}
        </div>
        <div className="col gap16">
          <div className="card">
            <div className="card-h"><div className="card-t">Próximos lançamentos</div></div>
            <div style={{ padding: '6px 0' }}>
              {d.upcoming.map((p) => (
                <div key={p.id} className="row gap12" style={{ padding: '8px 18px' }}>
                  <div className="col" style={{ width: 34, alignItems: 'center', lineHeight: 1.1 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{p.date.slice(8, 10)}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--mute2)', textTransform: 'uppercase' }}>{MONTHS_SHORT[Number(p.date.slice(5, 7)) - 1]}</span>
                  </div>
                  <div className="grow ellipsis" style={{ fontSize: 13 }}>{p.description}</div>
                  <div className="num" style={{ fontSize: 13, color: p.type === 'INCOME' ? 'var(--ok)' : 'var(--text2)' }}>{p.type === 'INCOME' ? '+' : '−'} {brl(p.amount)}</div>
                </div>
              ))}
              {!d.upcoming.length && <div className="empty" style={{ padding: 24 }}>Nada previsto.</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><div className="card-t">Saídas por categoria</div></div>
            <div className="col gap12" style={{ padding: '14px 18px' }}>
              {d.expensesByCategory.map((c) => (
                <div key={c.category}>
                  <div className="row between" style={{ fontSize: 12.5, marginBottom: 6 }}><span>{c.category}</span><span className="num muted">{brl(c.amount)}</span></div>
                  <Progress value={c.pct} color="var(--sep)" />
                </div>
              ))}
              {!d.expensesByCategory.length && <div style={{ fontSize: 12.5, color: 'var(--mute2)' }}>Sem saídas neste mês.</div>}
            </div>
          </div>
        </div>
      </div>
      {modal && <TransactionModal onClose={() => setModal(false)} />}
    </div>
  );
}
