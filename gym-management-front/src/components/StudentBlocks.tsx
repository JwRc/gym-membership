import { useState } from 'react';
import type { StudentDetail } from '../api/types';
import { beltBg } from '../lib/theme';
import { Belt, ICONS, Icon } from './ui';

/**
 * Cartão "Graduação" (ficha do aluno e portal). Sem os handlers (portal) fica só leitura.
 * Exclusões pedem um segundo clique para confirmar.
 */
export function RankCard({ ranks, onGrad, onEdit, onDeleteHistory, onRemove }: {
  ranks: StudentDetail['ranks'];
  onGrad?: (disciplineId: string) => void;
  onEdit?: (disciplineId: string) => void;
  onDeleteHistory?: (promotionId: string) => void;
  onRemove?: (disciplineId: string) => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const twice = (key: string, fn: () => void) => (armed === key ? (setArmed(null), fn()) : setArmed(key));
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">Graduação</div></div>
      {ranks.map((g, i) => (
        <div key={g.discipline.id} style={{ padding: '16px 18px', borderTop: i ? '1px solid var(--line)' : undefined }}>
          <div className="row between">
            <span className="row gap8" style={{ fontSize: 12.5, color: 'var(--mute)', fontWeight: 500 }}>
              <span className="sq" style={{ background: g.discipline.color }} />{g.discipline.name}
            </span>
            <div className="row gap6">
              {onRemove && ranks.length > 1 && (
                <button className="btn btn-sm btn-ghost" style={armed === `rm:${g.discipline.id}` ? { color: 'var(--bad)' } : undefined}
                  title="Tirar o aluno desta modalidade (graduação, histórico e turmas dela)"
                  onClick={() => twice(`rm:${g.discipline.id}`, () => onRemove(g.discipline.id))}>
                  {armed === `rm:${g.discipline.id}` ? 'Confirmar remoção' : 'Remover'}
                </button>
              )}
              {onEdit && <button className="btn btn-sm btn-ghost" onClick={() => onEdit(g.discipline.id)}>Alterar</button>}
              {g.next && onGrad && <button className="btn btn-sm" onClick={() => onGrad(g.discipline.id)}>Registrar graduação</button>}
            </div>
          </div>
          <div className="row gap16" style={{ marginTop: 12 }}>
            <Belt b={g.belt} w={96} h={20} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{g.belt.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--mute)', marginTop: 2 }}>Há {g.since}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--mute)' }}>{g.nextLabel} · última graduação há {g.timeInRank}</div>
          {!!g.history.length && (
            <div style={{ marginTop: 16 }}>
              {g.history.map((h, k) => (
                <div key={k} className="row gap12" style={{ alignItems: 'stretch' }}>
                  <div className="col" style={{ alignItems: 'center', width: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: beltBg(h.color, h.color2, 3), boxShadow: 'inset 0 0 0 1px var(--beltln)', marginTop: 4, flexShrink: 0 }} />
                    {k < g.history.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--line)', margin: '3px 0' }} />}
                  </div>
                  <div className="row between grow" style={{ paddingBottom: 12 }}>
                    <div><div style={{ fontSize: 13 }}>{h.title}</div>{h.instructor && <div style={{ fontSize: 11.5, color: 'var(--mute2)', marginTop: 1 }}>{h.instructor}</div>}</div>
                    <div className="row gap6" style={{ alignItems: 'flex-start' }}>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{h.date}</span>
                      {onDeleteHistory && h.id && (
                        <button className="icon-btn" style={{ width: 20, height: 20, ...(armed === h.id ? { color: 'var(--bad)' } : {}) }}
                          title={armed === h.id ? 'Clique de novo para apagar' : 'Apagar do histórico (lançado por engano)'}
                          onClick={() => twice(h.id!, () => onDeleteHistory(h.id!))}>
                          <Icon d={armed === h.id ? ICONS.check : ICONS.trash} size={11} />
                        </button>
                      )}
                    </div>
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
