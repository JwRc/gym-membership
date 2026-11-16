import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '../api/client';
import type { Plan } from '../api/types';
import { Alert, Avatar, ErrorBox, ICONS, Icon, Loading, Seg } from '../components/ui';
import { PlanModal } from '../modals/PlanModal';
import { useMutate } from '../modals/useMutate';
import { brl } from '../lib/format';
import { soft } from '../lib/theme';

const COLS = 'minmax(180px,1.6fr) minmax(160px,1.4fr) minmax(160px,1.4fr) 90px 110px 110px';

const Chips = ({ items, empty }: { items: { id: string; name: string; color: string }[]; empty: string }) =>
  items.length ? (
    <div className="row wrap" style={{ gap: 4 }}>
      {items.map((x) => <span key={x.id} className="pill" style={{ background: soft(x.color), color: x.color }}>{x.name}</span>)}
    </div>
  ) : <span style={{ fontSize: 12, color: 'var(--mute2)' }}>{empty}</span>;

export function PlansPage() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['plans'], queryFn: () => get<{ plans: Plan[] }>('/plans') });
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [edit, setEdit] = useState<Plan | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const m = useMutate();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const plans = q.data!.plans;
  const active = plans.filter((p) => !p.archived);
  const archived = plans.filter((p) => p.archived);
  // se o último arquivado for restaurado, a aba some
  const view = tab === 'archived' && !archived.length ? 'active' : tab;
  const list = view === 'active' ? active : archived;
  const students = active.reduce((n, p) => n + p.studentCount, 0);

  return (
    <div className="page">
      <div className="page-h">
        <div><h1>Planos</h1><div className="page-sub">{active.length} ativos · {students} alunos ativos em planos · o plano matricula o aluno nas modalidades e turmas dele</div></div>
        <button className="btn btn-primary" onClick={() => setEdit('new')}><Icon d={ICONS.plus} size={14} width={2.2} />Novo plano</button>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
      <div className="card" style={{ overflow: 'hidden' }}>
        {!!archived.length && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
            <Seg value={view} onChange={setTab} options={[
              { v: 'active', label: 'Ativos', extra: <span className="num" style={{ fontSize: 11, color: 'var(--mute2)' }}>{active.length}</span> },
              { v: 'archived', label: 'Arquivados', extra: <span className="num" style={{ fontSize: 11, color: 'var(--mute2)' }}>{archived.length}</span> },
            ]} />
          </div>
        )}
        <div className="thead" style={{ gridTemplateColumns: COLS }}><div>Plano</div><div>Modalidades</div><div>Turmas automáticas</div><div className="right">Alunos</div><div className="right">Mensalidade</div><div /></div>
        {list.map((p) => (
          <Fragment key={p.id}>
            <div className="trow click" style={{ gridTemplateColumns: COLS }} onClick={() => setEdit(p)}>
              <div style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                {p.description && <div className="ellipsis" style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 1 }}>{p.description}</div>}
              </div>
              <Chips items={p.disciplines} empty="Nenhuma" />
              <Chips items={p.classGroups} empty="Nenhuma (opcional)" />
              <div className="right">
                <button className="btn btn-sm btn-ghost num" disabled={!p.students.length} title="Ver alunos"
                  onClick={(e) => { e.stopPropagation(); setOpen(open === p.id ? null : p.id); }}>
                  {p.studentCount}
                  {p.students.length > p.studentCount && <span style={{ color: 'var(--mute2)' }}>+{p.students.length - p.studentCount}</span>}
                  <Icon d={ICONS.chevR} size={12} style={{ transform: open === p.id ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} />
                </button>
              </div>
              <div className="right num" style={{ fontSize: 13 }}>{brl(p.price)}</div>
              <div className="right">
                {p.archived
                  ? <button className="btn btn-sm" disabled={m.busy} onClick={(e) => { e.stopPropagation(); m.run(() => post(`/plans/${p.id}/restore`), `${p.name} restaurado`); }}>Restaurar</button>
                  : <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEdit(p); }}>Editar</button>}
              </div>
            </div>
            {open === p.id && (
              <div className="row wrap gap6" style={{ padding: '10px 18px 14px', borderBottom: '1px solid var(--line2)', background: 'var(--sunk)' }}>
                {p.students.map((s) => (
                  <div key={s.id} className="chip" style={{ opacity: s.status === 'ACTIVE' ? 1 : 0.55 }} onClick={() => nav(`/alunos/${s.id}`)}
                    title={s.status === 'ACTIVE' ? undefined : s.status === 'LOCKED' ? 'Trancado' : 'Inativo'}>
                    <Avatar name={s.name} initials={s.initials} size={20} />{s.name}
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        ))}
        {!list.length && <div className="empty">{view === 'active' ? 'Nenhum plano ainda. Crie um plano para matricular alunos nas modalidades e turmas automaticamente.' : 'Nenhum plano arquivado.'}</div>}
      </div>
      {edit && <PlanModal plan={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
