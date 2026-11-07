import type { StudentDetail } from '../api/types';
import { Belt, Progress } from './ui';
import { pct } from '../lib/format';

/** Cartão "Graduação" (ficha do aluno e portal). */
export function RankCard({ ranks, onGrad }: { ranks: StudentDetail['ranks']; onGrad?: (disciplineId: string) => void }) {
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">Graduação</div></div>
      {ranks.map((g, i) => (
        <div key={g.discipline.id} style={{ padding: '16px 18px', borderTop: i ? '1px solid var(--line)' : undefined }}>
          <div className="row between">
            <span className="row gap8" style={{ fontSize: 12.5, color: 'var(--mute)', fontWeight: 500 }}>
              <span className="sq" style={{ background: g.discipline.color }} />{g.discipline.name}
            </span>
            {g.eligible && (onGrad ? <button className="btn-gold" onClick={() => onGrad(g.discipline.id)}>Apto a graduar</button> : <span className="pill pill-gold">Apto a graduar</span>)}
          </div>
          <div className="row gap16" style={{ marginTop: 12 }}>
            <Belt b={g.belt} w={96} h={20} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{g.belt.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--mute)', marginTop: 2 }}>Há {g.since}</div>
            </div>
          </div>
          {g.requirement && (
            <div style={{ marginTop: 14 }}>
              <div className="row between" style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 6 }}>
                <span>{g.nextLabel} · {g.classesSince}/{g.requirement.classes} aulas</span>
                <span className="num" style={{ color: g.eligible ? 'var(--gold)' : 'var(--text2)' }}>{g.eligible ? 'Apto' : `${pct(g.pct ?? 0)} · ${g.status}`}</span>
              </div>
              <Progress value={g.pct} color={g.eligible ? 'var(--gold)' : g.discipline.color} />
            </div>
          )}
          {!!g.history.length && (
            <div style={{ marginTop: 16 }}>
              {g.history.map((h, k) => (
                <div key={k} className="row gap12" style={{ alignItems: 'stretch' }}>
                  <div className="col" style={{ alignItems: 'center', width: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: h.color, boxShadow: 'inset 0 0 0 1px var(--beltln)', marginTop: 4, flexShrink: 0 }} />
                    {k < g.history.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--line)', margin: '3px 0' }} />}
                  </div>
                  <div className="row between grow" style={{ paddingBottom: 12 }}>
                    <div><div style={{ fontSize: 13 }}>{h.title}</div>{h.instructor && <div style={{ fontSize: 11.5, color: 'var(--mute2)', marginTop: 1 }}>{h.instructor}</div>}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{h.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!ranks.length && <div className="empty">Sem modalidades.</div>}
    </div>
  );
}

export function ClassesCard({ classes, empty, title = 'Turmas matriculadas' }: { classes: StudentDetail['classes']; empty: string; title?: string }) {
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">{title}<span style={{ fontSize: 12, color: 'var(--mute2)', fontWeight: 400 }}>{classes.length}</span></div></div>
      <div style={{ padding: '6px 0' }}>
        {classes.map((t) => (
          <div key={t.id} className="row gap12" style={{ padding: '10px 18px' }}>
            <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: t.color }} />
            <div className="grow">
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{t.days} · {t.time}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>{t.instructor}</div>
          </div>
        ))}
        {!classes.length && <div className="empty" style={{ padding: 28 }}>{empty}</div>}
      </div>
    </div>
  );
}
