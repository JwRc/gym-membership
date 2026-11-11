import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { del, get, patch, post } from '../api/client';
import type { DisciplineT, Level } from '../api/types';
import { Alert, ErrorBox, Field, ICONS, Icon, Loading, Modal } from '../components/ui';
import { useMutate } from '../modals/useMutate';
import { brl, moneyInput, parseMoney } from '../lib/format';

interface Resp {
  colors: string[];
  instructors: { id: string; name: string }[];
  disciplines: DisciplineT[];
  catalog: { id: string; name: string; color: string; system: string; levels: Level[]; inUse: string[] }[];
}
const COLS = 'minmax(150px,1.5fr) minmax(130px,1.1fr) minmax(110px,1fr) minmax(110px,1fr) 96px 56px 236px';

const Dots = ({ levels }: { levels: Level[] }) => (
  <div className="row" style={{ gap: 3 }}>
    {levels.map((l, i) => <span key={i} title={l.name} style={{ width: 12, height: 6, borderRadius: 2, background: l.color, boxShadow: 'inset 0 0 0 1px var(--beltln)' }} />)}
  </div>
);

export function DisciplinesPage() {
  const q = useQuery({ queryKey: ['disciplines'], queryFn: () => get<Resp>('/disciplines') });
  const [edit, setEdit] = useState<DisciplineT | 'new' | null>(null);
  const m = useMutate();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  return (
    <div className="page">
      <div className="page-h">
        <div><h1>Modalidades</h1><div className="page-sub">{d.disciplines.length} na academia · {d.disciplines.filter((x) => x.customized).length} personalizadas</div></div>
        <button className="btn btn-primary" onClick={() => setEdit('new')}><Icon d={ICONS.plus} size={14} width={2.2} />Nova modalidade</button>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-h"><div className="card-t">Da academia</div></div>
        <div className="thead" style={{ gridTemplateColumns: COLS }}><div>Modalidade</div><div>Origem</div><div>Níveis</div><div>Professor</div><div className="right">Mensalidade</div><div className="right">Alunos</div><div /></div>
        {d.disciplines.map((x) => (
          <div key={x.id} className="trow" style={{ gridTemplateColumns: COLS }}>
            <div className="row gap10"><span className="sq" style={{ width: 10, height: 10, borderRadius: 3, background: x.color }} /><div><div style={{ fontSize: 13.5, fontWeight: 500 }}>{x.name}</div><div style={{ fontSize: 12, color: 'var(--mute2)' }}>{x.system}</div></div></div>
            <div>
              <span className={'pill ' + (!x.origin ? 'pill-blue' : x.customized ? 'pill-gold' : 'pill-mute')}>{!x.origin ? 'Própria' : x.customized ? 'Personalizada' : 'Catálogo padrão'}</span>
              {x.customized && x.customizedAt && <div style={{ fontSize: 11.5, color: 'var(--mute2)', marginTop: 3 }}>{x.origin ? `de ${x.origin.name} · ` : ''}desde {x.customizedAt}</div>}
            </div>
            <div>{x.levels.length ? <Dots levels={x.levels} /> : <span style={{ fontSize: 12, color: 'var(--mute2)' }}>Sem graduação</span>}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{x.instructor?.name ?? '—'}</div>
            <div className="right num" style={{ fontSize: 13 }}>{brl(x.monthlyPrice)}</div>
            <div className="right num muted" style={{ fontSize: 13 }}>{x.students}</div>
            <div className="row gap6" style={{ justifyContent: 'flex-end' }}>
              {x.origin && x.customized && <button className="btn btn-sm btn-ghost" onClick={() => m.run(() => post(`/disciplines/${x.id}/restore`), `${x.origin!.name} restaurada ao padrão`)}>Restaurar padrão</button>}
              {!x.students && <button className="icon-btn" title="Remover da academia" onClick={() => m.run(() => del(`/disciplines/${x.id}`), `${x.name} removida`)}><Icon d={ICONS.trash} size={14} /></button>}
              <button className="btn btn-sm" onClick={() => setEdit(x)}>Editar</button>
            </div>
          </div>
        ))}
        {!d.disciplines.length && <div className="empty">Nenhuma modalidade ainda. Adicione do catálogo abaixo ou crie uma nova.</div>}
      </div>
      <div className="card">
        <div className="card-h"><div className="card-t">Catálogo padrão</div><span style={{ fontSize: 12, color: 'var(--mute2)' }}>Igual para todas as academias · editar cria uma cópia só sua</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, padding: 16 }}>
          {d.catalog.map((c) => (
            <div key={c.id} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--sunk)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row gap8"><span className="sq" style={{ background: c.color }} /><span style={{ fontSize: 13.5, fontWeight: 500 }}>{c.name}</span></div>
              <div style={{ fontSize: 12, color: 'var(--mute2)' }}>{c.system} · {c.levels.length} níveis</div>
              <Dots levels={c.levels} />
              <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                {c.inUse.length ? <div style={{ fontSize: 12, color: 'var(--mute)' }}>Em uso como {c.inUse.join(', ')}</div> : <button className="btn btn-sm" onClick={() => m.run(() => post(`/disciplines/from-catalog/${c.id}`), `${c.name} adicionada`)}>Adicionar à academia</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {edit && <DisciplineModal d={edit === 'new' ? undefined : edit} colors={d.colors} instructors={d.instructors} onClose={() => setEdit(null)} />}
    </div>
  );
}

function DisciplineModal({ d, colors, instructors, onClose }: { d?: DisciplineT; colors: string[]; instructors: { id: string; name: string }[]; onClose: () => void }) {
  const [name, setName] = useState(d?.name ?? '');
  const [color, setColor] = useState(d?.color ?? colors[0]);
  const [system, setSystem] = useState(d?.system ?? 'Níveis');
  const [instructorId, setInstr] = useState(d?.instructor?.id ?? instructors[0]?.id ?? '');
  const [price, setPrice] = useState(d ? moneyInput(d.monthlyPrice) : '');
  const [levels, setLevels] = useState<{ name: string; color: string; m: string; a: string }[]>(
    (d?.levels ?? []).map((l) => ({ name: l.name, color: l.color, m: l.minMonths?.toString() ?? '', a: l.minClasses?.toString() ?? '' })),
  );
  const m = useMutate();
  const upd = (i: number, p: Partial<(typeof levels)[number]>) => setLevels(levels.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const save = async () => {
    const monthlyPrice = parseMoney(price);
    if (!(monthlyPrice >= 0)) return m.setErr('Informe a mensalidade.');
    const body = {
      name, color, system, instructorId: instructorId || null, monthlyPrice,
      levels: levels.map((l) => ({ name: l.name, color: l.color, minMonths: l.m === '' ? null : Number(l.m), minClasses: l.a === '' ? null : Number(l.a) })),
    };
    const r = await m.run(() => (d ? patch(`/disciplines/${d.id}`, body) : post('/disciplines', body)), `${name} salva`);
    if (r) onClose();
  };
  const L = 'minmax(0,30px) 44px minmax(0,1fr) 90px 90px 28px';
  return (
    <Modal width={640} onClose={onClose}
      title={<span className="row gap8">{d ? `Editar ${d.name}` : 'Nova modalidade'}{d && <span className={'pill ' + (!d.origin ? 'pill-blue' : d.customized ? 'pill-gold' : 'pill-mute')}>{!d.origin ? 'Própria' : d.customized ? 'Personalizada' : 'Catálogo padrão'}</span>}</span>}
      footer={<><span style={{ flex: 1, fontSize: 12, color: 'var(--mute)' }}>{d?.origin ? 'Alterações valem só para a sua academia.' : ''}</span><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>Salvar</button></>}>
      {d?.origin && !d.customized && <Alert warn>Esta modalidade segue o catálogo padrão. Ao salvar mudanças, ela vira uma cópia personalizada da academia.</Alert>}
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Jiu-jitsu Kids" /></Field>
        <Field label="Cor">
          <div className="row gap6 wrap" style={{ minHeight: 36 }}>
            {colors.map((c) => <div key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', boxShadow: c === color ? '0 0 0 2px var(--modal),0 0 0 3.5px var(--text)' : undefined }} />)}
          </div>
        </Field>
      </div>
      <div className="grid3" style={{ gap: 12 }}>
        <Field label="Sistema de graduação"><input className="input" value={system} onChange={(e) => setSystem(e.target.value)} placeholder="Ex.: Faixas e graus" /></Field>
        <Field label="Professor responsável"><select className="input" value={instructorId} onChange={(e) => setInstr(e.target.value)}>{instructors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Mensalidade (R$)"><input className="input num" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" /></Field>
      </div>
      <div>
        <div className="row between" style={{ marginBottom: 8 }}><span style={{ fontSize: 12.5, fontWeight: 500 }}>Níveis de graduação</span><span style={{ fontSize: 12, color: 'var(--mute2)' }}>Tempo e aulas mínimos desde a última graduação</span></div>
        <div style={{ border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden' }}>
          <div className="thead" style={{ gridTemplateColumns: L, gap: 8, padding: '0 10px', height: 32 }}><div>#</div><div>Cor</div><div>Nome</div><div>Meses mín.</div><div>Aulas mín.</div><div /></div>
          {levels.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: L, gap: 8, padding: '6px 10px', alignItems: 'center', borderBottom: '1px solid var(--line2)' }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--mute2)' }}>{i + 1}</span>
              <input type="color" value={l.color} onChange={(e) => upd(i, { color: e.target.value.toUpperCase() })} style={{ width: 40, height: 28, padding: 0, border: '1px solid var(--bd2)', borderRadius: 6, background: 'transparent' }} />
              <input className="input" style={{ height: 30 }} value={l.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Nome do nível" />
              <input className="input num" style={{ height: 30 }} value={l.m} onChange={(e) => upd(i, { m: e.target.value.replace(/\D/g, '') })} placeholder="—" />
              <input className="input num" style={{ height: 30 }} value={l.a} onChange={(e) => upd(i, { a: e.target.value.replace(/\D/g, '') })} placeholder="—" />
              <button className="icon-btn" disabled={(d?.students ?? 0) > 0 && i < (d?.levels.length ?? 0)} title="Remover nível" onClick={() => setLevels(levels.filter((_, k) => k !== i))}><Icon d={ICONS.close} size={12} /></button>
            </div>
          ))}
          {!levels.length && <div style={{ padding: 14, fontSize: 12.5, color: 'var(--mute2)' }}>Sem níveis — a modalidade não terá graduação.</div>}
          {levels.length < 15 && <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--sub)', cursor: 'pointer' }} onClick={() => setLevels([...levels, { name: '', color: '#EDEDEA', m: '', a: '' }])}>+ Adicionar nível</div>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 8 }}>Deixe os mínimos em branco no último nível (graduação máxima).</div>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
