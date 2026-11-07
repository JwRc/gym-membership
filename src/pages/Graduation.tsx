import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
import type { Belt as BeltT } from '../api/types';
import { Avatar, Belt, ErrorBox, Loading, Progress } from '../components/ui';
import { GraduationModal } from '../modals/basic';
import { pct } from '../lib/format';

interface Resp {
  tabs: { id: string; name: string; color: string; eligible: number }[];
  discipline: { id: string; name: string; color: string; system: string; instructor: string | null; note: string } | null;
  levels: (BeltT & { n: number; order: number; requirement: string; count: number })[];
  rows: { studentId: string; name: string; initials: string; belt: BeltT; time: string; classes: string; status: string; pct: number | null; eligible: boolean; canPromote: boolean }[];
  eligibleTotal: number;
}
const COLS = 'minmax(160px,2fr) minmax(130px,1.5fr) 76px 66px minmax(120px,1.4fr) 76px';

export function GraduationPage() {
  const nav = useNavigate();
  const [disc, setDisc] = useState<string | undefined>();
  const [only, setOnly] = useState(false);
  const [modal, setModal] = useState<{ d: string; s?: string } | null>(null);
  const q = useQuery({ queryKey: ['graduation', disc ?? '', only], queryFn: () => get<Resp>('/graduation', { disciplineId: disc, onlyEligible: only }), placeholderData: keepPreviousData });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const cur = d.discipline;

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Graduação</h1>
          <div className="page-sub">{d.eligibleTotal} aluno(s) aptos a graduar em todas as modalidades</div>
        </div>
        {cur && <button className="btn btn-primary" onClick={() => setModal({ d: cur.id })}>Registrar graduação</button>}
      </div>
      {!cur ? (
        <div className="card empty">Nenhuma modalidade com sistema de graduação.</div>
      ) : (
        <>
          <div className="seg">
            {d.tabs.map((t) => (
              <div key={t.id} className={t.id === cur.id ? 'on' : ''} onClick={() => setDisc(t.id)}>
                <span className="sq" style={{ width: 7, height: 7, background: t.color }} />{t.name}
                {t.eligible > 0 && <span className="pill pill-gold" style={{ fontSize: 10.5, padding: '0 6px' }}>{t.eligible}</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
            <div className="card">
              <div className="card-h">
                <div><div className="card-t">{cur.system}</div><div style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 2 }}>{cur.name} · {cur.instructor ?? 'Sem professor'}</div></div>
                <button className="btn btn-sm" onClick={() => nav('/modalidades')}>Editar</button>
              </div>
              <div style={{ padding: '6px 0' }}>
                {d.levels.map((l) => (
                  <div key={l.order} className="row gap12" style={{ padding: '9px 18px' }}>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--mute2)', width: 16 }}>{l.n}</span>
                    <Belt b={l} w={36} h={10} />
                    <div className="grow"><div style={{ fontSize: 13, fontWeight: 500 }}>{l.name}</div><div style={{ fontSize: 11.5, color: 'var(--mute2)', marginTop: 1 }}>{l.requirement}</div></div>
                    <span className="num" style={{ fontSize: 12.5, color: 'var(--mute)' }}>{l.count}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>{cur.note}</div>
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="card-h">
                <div className="card-t">Alunos <span style={{ color: 'var(--mute2)', fontWeight: 400 }}>· {d.rows.length}</span></div>
                <div className="row gap8" style={{ fontSize: 12.5, color: 'var(--mute)', cursor: 'pointer' }} onClick={() => setOnly(!only)}>
                  <div className={'toggle' + (only ? ' on' : '')}><div /></div>Somente aptos
                </div>
              </div>
              <div className="thead" style={{ gridTemplateColumns: COLS }}><div>Aluno</div><div>Graduação atual</div><div>Tempo</div><div>Aulas</div><div>Progresso</div><div /></div>
              {d.rows.map((r) => (
                <div key={r.studentId} className="trow" style={{ gridTemplateColumns: COLS }}>
                  <div className="row gap10" style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => nav(`/alunos/${r.studentId}`)}>
                    <Avatar name={r.name} initials={r.initials} />
                    <span className="ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</span>
                  </div>
                  <div className="row gap8" style={{ fontSize: 12.5 }}><Belt b={r.belt} /><span>{r.belt.label}</span></div>
                  <div style={{ fontSize: 12.5, color: 'var(--mute)' }}>{r.time}</div>
                  <div className="num" style={{ fontSize: 12.5, color: 'var(--mute)' }}>{r.classes}</div>
                  <div>
                    <div className="row between" style={{ fontSize: 11.5, marginBottom: 5 }}>
                      <span style={{ color: r.eligible ? 'var(--gold)' : 'var(--mute)' }}>{r.status}</span>
                      <span className="num muted2">{r.pct != null ? pct(Math.min(1, r.pct)) : ''}</span>
                    </div>
                    <Progress value={r.pct} color={r.eligible ? 'var(--gold)' : cur.color} />
                  </div>
                  <div className="right">
                    {r.canPromote && (r.eligible ? <button className="btn-gold" onClick={() => setModal({ d: cur.id, s: r.studentId })}>Graduar</button> : <button className="btn btn-sm btn-ghost" onClick={() => setModal({ d: cur.id, s: r.studentId })}>Graduar</button>)}
                  </div>
                </div>
              ))}
              {!d.rows.length && <div className="empty">{only ? 'Nenhum aluno apto nesta modalidade no momento.' : 'Nenhum aluno nesta modalidade.'}</div>}
            </div>
          </div>
        </>
      )}
      {modal && <GraduationModal disciplineId={modal.d} studentId={modal.s} onClose={() => setModal(null)} />}
    </div>
  );
}
