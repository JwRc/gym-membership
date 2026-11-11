import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '../api/client';
import type { ClassGroup, DisciplineT } from '../api/types';
import { Alert, Field, Modal, Seg } from '../components/ui';
import { WEEKDAYS, hm } from '../lib/format';
import { soft } from '../lib/theme';
import { useMutate } from './useMutate';

export function SlotModal({ init, classes, instructors, onClose }: { init: { day: number; sm: number }; classes: ClassGroup[]; instructors: { id: string; name: string }[]; onClose: () => void }) {
  const disc = useQuery({ queryKey: ['disciplines'], queryFn: () => get<{ disciplines: DisciplineT[] }>('/disciplines') });
  const [mode, setMode] = useState<'new' | 'existing'>(classes.length ? 'new' : 'new');
  const [name, setName] = useState('');
  const [disciplineId, setDisc] = useState('');
  const [instructorId, setInstr] = useState('');
  const [capacity, setCap] = useState('20');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [day, setDay] = useState(init.day);
  const [sm, setSm] = useState(init.sm);
  const [dur, setDur] = useState(60);
  const em = Math.min(22 * 60, sm + dur);
  const m = useMutate();

  const discs = disc.data?.disciplines ?? [];
  const dId = disciplineId || discs[0]?.id || '';
  const conflicts = useQuery({
    queryKey: ['conflicts', day, sm, em],
    queryFn: () => get<string[]>('/classes/conflicts', { weekday: day, startMin: sm, endMin: em }),
  });
  const ex = classes.find((c) => c.id === classId);

  const save = async () => {
    const slot = { weekday: day, startMin: sm, endMin: em };
    const r =
      mode === 'new'
        ? await m.run(
            () => post('/classes', { name, disciplineId: dId, instructorId: instructorId || discs.find((d) => d.id === dId)?.instructor?.id, capacity: Number(capacity), slot }),
            `${name} criada · ${WEEKDAYS[day]}, ${hm(sm)}–${hm(em)}`,
          )
        : await m.run(() => post(`/classes/${classId}/slots`, slot), `${ex?.name} · novo horário ${WEEKDAYS[day]}, ${hm(sm)}`);
    if (r) onClose();
  };

  return (
    <Modal title="Novo horário" sub={`${WEEKDAYS[day]} · ${hm(sm)}–${hm(em)}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>Salvar horário</button></>}>
      <Seg large value={mode} onChange={setMode} options={[{ v: 'new', label: 'Nova turma' }, { v: 'existing', label: 'Turma existente' }]} />
      {mode === 'new' ? (
        <>
          <Field label="Nome da turma"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Jiu-jitsu Competição" autoFocus /></Field>
          <Field label="Modalidade">
            <div className="row wrap gap6">
              {discs.map((d) => (
                <div key={d.id} className={'chip' + (d.id === dId ? ' on' : '')} style={d.id === dId ? { borderColor: d.color, background: soft(d.color) } : undefined} onClick={() => { setDisc(d.id); setInstr(d.instructor?.id ?? ''); }}>
                  <span className="sq" style={{ width: 7, height: 7, background: d.color }} />{d.name}
                </div>
              ))}
            </div>
          </Field>
          <div className="grid2" style={{ gap: 12 }}>
            <Field label="Professor">
              <select className="input" value={instructorId || discs.find((d) => d.id === dId)?.instructor?.id || ''} onChange={(e) => setInstr(e.target.value)}>
                {instructors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Capacidade"><input className="input num" value={capacity} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
        </>
      ) : (
        <Field label="Turma" hint={ex && `${ex.discipline.name} · ${ex.instructor?.name ?? 'Sem professor'} · hoje em ${ex.days}`}>
          <select className="input" value={classId} onChange={(e) => { setClassId(e.target.value); const c = classes.find((x) => x.id === e.target.value); if (c?.slots[0]) setDur(c.slots[0].endMin - c.slots[0].startMin); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.days}</option>)}
          </select>
        </Field>
      )}
      <div className="grid3" style={{ gap: 12 }}>
        <Field label="Dia">
          <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>{WEEKDAYS.map((n, i) => <option key={i} value={i}>{n}</option>)}</select>
        </Field>
        <Field label="Início">
          <input className="input" type="time" step={900} value={hm(sm)} onChange={(e) => { const [h, mm] = (e.target.value || '00:00').split(':').map(Number); setSm(Math.max(360, Math.min(1290, h * 60 + mm))); }} />
        </Field>
        <Field label="Duração">
          <select className="input" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
            <option value={45}>45 min</option><option value={60}>1h</option><option value={75}>1h15</option><option value={90}>1h30</option><option value={120}>2h</option>
          </select>
        </Field>
      </div>
      {!!conflicts.data?.length && <Alert warn>Conflito no tatame com {conflicts.data.join(', ')}</Alert>}
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
