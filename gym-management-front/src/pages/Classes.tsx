import { PointerEvent as RPointerEvent, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { del, errMsg, get, patch } from '../api/client';
import type { ClassGroup, ClassSlot } from '../api/types';
import { useApp } from '../auth/AppContext';
import { Avatar, ErrorBox, ICONS, Icon, Loading, Seg } from '../components/ui';
import { SlotModal } from '../modals/SlotModal';
import { WEEKDAYS, WEEKDAYS_SHORT, hm } from '../lib/format';
import { soft } from '../lib/theme';

const START = 6 * 60;
const END = 22 * 60;
const PX = 46; // px por hora
const TIME_COL = 56;

interface Resp { classes: ClassGroup[]; instructors: { id: string; name: string }[] }
interface Drag { slotId: string; day: number; sm: number; em: number }

export function ClassesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast } = useApp();
  const q = useQuery({ queryKey: ['classes'], queryFn: () => get<Resp>('/classes') });
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [newSlot, setNewSlot] = useState<{ day: number; sm: number } | null>(null);
  const cal = useRef<HTMLDivElement>(null);

  const week = useMemo(() => {
    const t = new Date();
    const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
    return WEEKDAYS_SHORT.map((label, i) => {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      return { label, num: d.getDate(), today: d.toDateString() === t.toDateString() };
    });
  }, []);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { classes } = q.data!;
  const discs = [...new Map(classes.map((c) => [c.discipline.id, c.discipline])).values()];
  const visible = classes.filter((c) => filter === 'all' || c.discipline.id === filter);
  const totalSlots = classes.reduce((a, c) => a + c.slots.length, 0);

  const geo = (e: { clientX: number; clientY: number }) => {
    const r = cal.current!.getBoundingClientRect();
    const colW = (r.width - TIME_COL) / 6;
    return { day: Math.max(0, Math.min(5, Math.floor((e.clientX - r.left - TIME_COL) / colW))), mins: START + ((e.clientY - r.top) / PX) * 60 };
  };

  const startDrag = (e: RPointerEvent, c: ClassGroup, s: ClassSlot) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const g0 = geo(e);
    const off = g0.mins - s.startMin;
    const dur = s.endMin - s.startMin;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let last: Drag | null = null;
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      const g = geo(ev);
      let sm = Math.round((g.mins - off) / 15) * 15;
      sm = Math.max(START, Math.min(END - dur, sm));
      last = { slotId: s.id, day: g.day, sm, em: sm + dur };
      setDrag(last);
    };
    const up = async () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (!moved || !last) {
        setDrag(null);
        setSel((x) => (x === c.id ? null : c.id));
        return;
      }
      const d: Drag = last;
      if (d.day === s.weekday && d.sm === s.startMin) return setDrag(null);
      // atualização otimista
      qc.setQueryData<Resp>(['classes'], (old) =>
        old && { ...old, classes: old.classes.map((g) => ({ ...g, slots: g.slots.map((x) => (x.id === s.id ? { ...x, weekday: d.day, startMin: d.sm, endMin: d.em } : x)) })) },
      );
      setDrag(null);
      try {
        const r = await patch<{ conflicts: string[] }>(`/classes/slots/${s.id}`, { weekday: d.day, startMin: d.sm, endMin: d.em });
        toast(`${c.name} → ${WEEKDAYS[d.day]}, ${hm(d.sm)}–${hm(d.em)}` + (r.conflicts.length ? ` · conflito com ${r.conflicts[0]}` : ''), r.conflicts.length > 0);
      } catch (err) {
        toast(errMsg(err), true);
      }
      qc.invalidateQueries();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const clickEmpty = (e: React.MouseEvent, day: number) => {
    const g = geo(e);
    setNewSlot({ day, sm: Math.max(START, Math.min(END - 60, Math.floor(g.mins / 30) * 30)) });
  };

  const removeSlot = async (s: ClassSlot) => {
    try {
      await del(`/classes/slots/${s.id}`);
      toast('Horário removido');
      qc.invalidateQueries();
    } catch (e) {
      toast(errMsg(e), true);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1600 }}>
      <div className="page-h">
        <div>
          <h1>Turmas e calendário</h1>
          <div className="page-sub">{classes.length} turmas · {totalSlots} horários por semana</div>
        </div>
        <div className="row gap8">
          <div className="seg"><div className="on">Esta semana</div></div>
          <button className="btn btn-primary" onClick={() => setNewSlot({ day: 0, sm: 18 * 60 })}><Icon d={ICONS.plus} size={14} width={2.2} />Nova turma</button>
        </div>
      </div>
      <div className="row gap10">
        <Seg value={filter} onChange={setFilter} options={[{ v: 'all', label: 'Todas' }, ...discs.map((d) => ({ v: d.id, label: <><span className="sq" style={{ width: 7, height: 7, background: d.color }} />{d.name}</> }))]} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--mute2)' }}>Clique num espaço vazio para adicionar · arraste para mudar o horário</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `${TIME_COL}px repeat(6,minmax(0,1fr))`, borderBottom: '1px solid var(--line)', background: 'var(--thead)' }}>
            <div />
            {week.map((d) => (
              <div key={d.label} className="row gap6" style={{ height: 40, padding: '0 10px', fontSize: 12.5, color: d.today ? 'var(--text)' : 'var(--mute)', borderLeft: '1px solid var(--line2)' }}>
                <span>{d.label}</span><span className="num" style={{ fontWeight: 600 }}>{d.num}</span>
                {d.today && <span className="pill pill-bad" style={{ fontSize: 10.5, padding: '1px 6px' }}>Hoje</span>}
              </div>
            ))}
          </div>
          <div ref={cal} className="cal" style={{ height: ((END - START) / 60) * PX, background: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX - 1}px, var(--line2) ${PX - 1}px, var(--line2) ${PX}px)` }}>
            <div>
              {Array.from({ length: (END - START) / 60 }, (_, i) => <div key={i} className="cal-hour">{i ? hm(START + i * 60) : ''}</div>)}
            </div>
            {week.map((d, day) => (
              <div key={day} className="cal-col" style={{ background: d.today ? 'rgba(229,72,77,0.025)' : undefined }} onClick={(e) => clickEmpty(e, day)}>
                {visible.flatMap((c) =>
                  c.slots.map((s) => {
                    const dr = drag?.slotId === s.id ? drag : null;
                    const wd = dr ? dr.day : s.weekday;
                    if (wd !== day) return null;
                    const sm = dr ? dr.sm : s.startMin;
                    const em = dr ? dr.em : s.endMin;
                    const isSel = sel === c.id;
                    return (
                      <div key={s.id} className="cal-block" onPointerDown={(e) => startDrag(e, c, s)} onClick={(e) => e.stopPropagation()}
                        style={{ top: ((sm - START) / 60) * PX + 1, height: ((em - sm) / 60) * PX - 2, background: soft(c.discipline.color, isSel ? 0.3 : 0.16), borderColor: soft(c.discipline.color, isSel ? 0.9 : 0.35), zIndex: dr ? 5 : 1, boxShadow: dr ? '0 8px 24px var(--shd)' : undefined }}>
                        <div className="row gap6 ellipsis" style={{ fontWeight: 500 }}><span className="sq" style={{ width: 6, height: 6, background: c.discipline.color }} />{c.name}</div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--mute)', marginTop: 2 }}>{hm(sm)}–{hm(em)} · {c.count}/{c.capacity}</div>
                      </div>
                    );
                  }),
                )}
                {d.today && nowMin > START && nowMin < END && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: ((nowMin - START) / 60) * PX, height: 2, background: 'var(--brand)', zIndex: 6, pointerEvents: 'none' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div className="card-t">Turmas</div><span style={{ fontSize: 12, color: 'var(--mute2)' }}>Alunos / capacidade</span></div>
          <div style={{ maxHeight: 760, overflow: 'auto' }}>
            {visible.map((t) => (
              <div key={t.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line2)', cursor: 'pointer', background: sel === t.id ? 'var(--hover)' : undefined }} onClick={() => setSel(sel === t.id ? null : t.id)}>
                <div className="row gap8">
                  <span className="sq" style={{ background: t.discipline.color }} />
                  <span className="grow ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{t.name}</span>
                  <span className="num" style={{ fontSize: 12, color: t.count >= t.capacity ? 'var(--bad)' : 'var(--mute)' }}>{t.count}/{t.capacity}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 4 }}>{t.days} · {t.time} · {t.instructor?.name ?? 'Sem professor'}</div>
                <div className="progress" style={{ marginTop: 8, height: 4 }}><div style={{ width: `${Math.min(1, t.count / t.capacity) * 100}%`, background: t.discipline.color }} /></div>
                {sel === t.id && (
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12 }}>
                    <div className="row wrap" style={{ gap: 4 }}>
                      {t.students.map((a) => <Avatar key={a.id} name={a.name} initials={a.initials} size={26} onClick={() => nav(`/alunos/${a.id}`)} />)}
                      {!t.students.length && <span style={{ fontSize: 12, color: 'var(--mute2)' }}>Nenhum aluno matriculado.</span>}
                    </div>
                    <div className="col gap4" style={{ marginTop: 10 }}>
                      {t.slots.map((s) => (
                        <div key={s.id} className="row between" style={{ fontSize: 12, color: 'var(--mute)' }}>
                          <span>{WEEKDAYS[s.weekday]} · {hm(s.startMin)}–{hm(s.endMin)}</span>
                          <button className="icon-btn" style={{ width: 22, height: 22 }} title="Remover horário" onClick={() => removeSlot(s)}><Icon d={ICONS.close} size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!visible.length && <div className="empty">Nenhuma turma ainda. Clique no calendário para criar.</div>}
          </div>
        </div>
      </div>
      {newSlot && <SlotModal init={newSlot} classes={classes} instructors={q.data!.instructors} onClose={() => setNewSlot(null)} />}
    </div>
  );
}
