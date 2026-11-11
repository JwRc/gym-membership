import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
import type { StudentRow, Tag } from '../api/types';
import { Avatar, Belt, ErrorBox, FinancePill, ICONS, Icon, Loading, Seg, StatusPill } from '../components/ui';
import { StudentModal } from '../modals/StudentModal';
import { ImportStudentsModal } from '../modals/ImportStudentsModal';
import { useApp } from '../auth/AppContext';
import { brl } from '../lib/format';
import { soft } from '../lib/theme';

interface ListResp { counts: Record<'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'all', number>; total: number; rows: StudentRow[] }
const COLS = 'minmax(240px,2.3fr) minmax(170px,1.3fr) minmax(200px,1.8fr) 110px 150px 110px 24px';

export function StudentsPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [disc, setDisc] = useState('all');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'all'>('ACTIVE');
  const finance = sp.get('finance') ?? 'all';
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const { can } = useApp();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sp.get('focus')) {
      input.current?.focus();
      sp.delete('focus');
      setSp(sp, { replace: true });
    }
  }, [sp, setSp]);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const tags = useQuery({ queryKey: ['tenant'], queryFn: () => get<{ disciplines: Tag[] }>('/tenant') });
  const list = useQuery({
    queryKey: ['students', dq, disc, status, finance],
    queryFn: () => get<ListResp>('/students', { q: dq || undefined, disciplineId: disc, status, finance }),
    placeholderData: keepPreviousData,
  });
  if (list.error) return <ErrorBox error={list.error} />;
  const d = list.data;
  const setFinance = (v: string) => {
    if (v === 'all') sp.delete('finance');
    else sp.set('finance', v);
    setSp(sp, { replace: true });
  };

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Alunos</h1>
          <div className="page-sub">{d ? `${d.counts.ACTIVE} ativos · ${d.total} no total` : ' '}</div>
        </div>
        <div className="row gap8">
          {can('students.import') && <button className="btn" onClick={() => setImporting(true)}>Importar planilha</button>}
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon d={ICONS.plus} size={14} width={2.2} />Novo aluno</button>
        </div>
      </div>
      <div className="row gap10 wrap">
        <div className="search" style={{ width: 280 }}>
          <Icon d={ICONS.search} size={14} stroke="var(--mute2)" width={2} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou telefone" />
        </div>
        <Seg value={disc} onChange={setDisc} options={[{ v: 'all', label: 'Todas' }, ...(tags.data?.disciplines ?? []).map((m) => ({ v: m.id, label: <><span className="sq" style={{ width: 7, height: 7, background: m.color }} />{m.name}</> }))]} />
        <Seg value={status} onChange={setStatus} options={(['ACTIVE', 'LOCKED', 'INACTIVE', 'all'] as const).map((v) => ({
          v, label: { ACTIVE: 'Ativos', LOCKED: 'Trancados', INACTIVE: 'Inativos', all: 'Todos' }[v],
          extra: <span className="num" style={{ fontSize: 11, color: 'var(--mute2)' }}>{d?.counts[v] ?? ''}</span>,
        }))} />
        <div style={{ flex: 1 }} />
        <select className="input" style={{ width: 'auto', height: 34, background: 'var(--field2)', borderColor: 'var(--bd)' }} value={finance} onChange={(e) => setFinance(e.target.value)}>
          <option value="all">Situação: todas</option><option value="ok">Em dia</option><option value="today">Vence hoje ou vencida</option><option value="late">Atrasado</option>
        </select>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="thead" style={{ gridTemplateColumns: COLS }}>
          <div>Aluno</div><div>Modalidades</div><div>Graduação</div><div>Status</div><div>Financeiro</div><div className="right">Mensalidade</div><div />
        </div>
        {!d ? <Loading /> : d.rows.map((s) => (
          <div key={s.id} className="trow click" style={{ gridTemplateColumns: COLS, minHeight: 56 }} onClick={() => nav(`/alunos/${s.id}`)}>
            <div className="row gap12" style={{ minWidth: 0 }}>
              <Avatar name={s.name} initials={s.initials} size={32} />
              <div style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 1 }}>{s.age} anos{s.phone ? ` · ${s.phone}` : ''}</div>
              </div>
            </div>
            <div className="row wrap gap6">
              {s.disciplines.map((m) => <span key={m.id} className="pill" style={{ background: soft(m.color), color: m.color }}>{m.name}</span>)}
            </div>
            <div className="col" style={{ gap: 5 }}>
              {s.ranks.map((r) => (
                <div key={r.discipline.id} className="row gap8" style={{ fontSize: 12.5, color: 'var(--text2)' }}>
                  <Belt b={r.belt} />
                  <span style={{ whiteSpace: 'nowrap' }}>{r.belt.label}</span>
                </div>
              ))}
            </div>
            <div><StatusPill s={s.status} /></div>
            <div><FinancePill f={s.finance} /></div>
            <div className="right num" style={{ fontSize: 13, color: 'var(--text2)' }}>{brl(s.monthlyFee)}</div>
            <Icon d={ICONS.chevR} size={14} stroke="var(--mute3)" width={2} />
          </div>
        ))}
        {d && !d.rows.length && <div className="empty">Nenhum aluno encontrado com esses filtros.</div>}
        {d && <div style={{ padding: '12px 18px', fontSize: 12, color: 'var(--mute2)' }}>{d.rows.length} aluno(s) exibido(s)</div>}
      </div>
      {creating && <StudentModal onClose={() => setCreating(false)} />}
      {importing && <ImportStudentsModal onClose={() => setImporting(false)} />}
    </div>
  );
}
