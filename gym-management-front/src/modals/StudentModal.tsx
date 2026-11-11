import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, patch, post } from '../api/client';
import type { ClassGroup, DisciplineT, StudentDetail, StudentStatus } from '../api/types';
import { Alert, Field, Modal } from '../components/ui';
import { moneyInput, parseMoney } from '../lib/format';
import { soft } from '../lib/theme';
import { useMutate } from './useMutate';

interface TenantT {
  dueDays: number[];
  plans: { id: string; name: string; price: number }[];
}

export function StudentModal({ student, onClose }: { student?: StudentDetail; onClose: () => void }) {
  const nav = useNavigate();
  const editing = !!student;
  const disc = useQuery({ queryKey: ['disciplines'], queryFn: () => get<{ disciplines: DisciplineT[] }>('/disciplines') });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => get<{ classes: ClassGroup[] }>('/classes') });
  const tenant = useQuery({ queryKey: ['tenant'], queryFn: () => get<TenantT>('/tenant') });

  const [f, setF] = useState({
    name: student?.name ?? '',
    gender: student?.gender ?? '',
    birthDate: student?.birthDate ?? '',
    email: student?.email ?? '',
    phone: student?.phone ?? '',
    status: (student?.status ?? 'ACTIVE') as StudentStatus,
    planId: student?.plan?.id ?? '',
    fee: student ? moneyInput(student.monthlyFee) : '',
    dueDay: student?.dueDay ?? 5,
    medicalNotes: student?.medicalNotes ?? '',
    guardianName: student?.guardian?.name ?? '',
    guardianRelation: student?.guardian?.relation ?? '',
    guardianPhone: student?.guardian?.phone ?? '',
    consent: !!student?.consentAt,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const existing = new Set(student?.ranks.map((r) => r.discipline.id) ?? []);
  const [ranks, setRanks] = useState<Record<string, number>>({});
  const [classIds, setClassIds] = useState<string[]>(student?.classes.map((c) => c.id) ?? []);
  const m = useMutate();

  const discs = disc.data?.disciplines ?? [];
  const chosen = new Set([...existing, ...Object.keys(ranks)]);
  const minor = f.birthDate && new Date().getFullYear() - Number(f.birthDate.slice(0, 4)) < 18;

  const save = async () => {
    const monthlyFee = parseMoney(f.fee);
    if (!(monthlyFee >= 0)) return m.setErr('Informe a mensalidade.');
    const body = {
      name: f.name, gender: f.gender || undefined, birthDate: f.birthDate, email: f.email, phone: f.phone || undefined,
      monthlyFee, dueDay: Number(f.dueDay), planId: f.planId || undefined, medicalNotes: f.medicalNotes || undefined,
      guardianName: f.guardianName || undefined, guardianRelation: f.guardianRelation || undefined, guardianPhone: f.guardianPhone || undefined,
      classGroupIds: classIds,
      consent: f.consent,
    };
    const newRanks = Object.entries(ranks).map(([disciplineId, levelOrder]) => ({ disciplineId, levelOrder }));
    if (editing) {
      const r = await m.run(() => patch(`/students/${student!.id}`, { ...body, status: f.status, addRanks: newRanks }), 'Cadastro atualizado');
      if (r) onClose();
    } else {
      if (!f.birthDate) return m.setErr('Informe a data de nascimento.');
      if (!f.consent) return m.setErr('Confirme o consentimento do aluno (ou responsável) para o uso dos dados.');
      const r = await m.run(() => post<{ id: string }>('/students', { ...body, ranks: newRanks }), `${f.name} cadastrado`);
      if (r) {
        onClose();
        nav(`/alunos/${r.id}`);
      }
    }
  };

  return (
    <Modal title={editing ? 'Editar aluno' : 'Novo aluno'} sub={editing ? student!.name : undefined} width={640} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>{editing ? 'Salvar' : 'Cadastrar aluno'}</button></>}>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Nome completo"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <div className="grid2" style={{ gap: 12 }}>
          <Field label="Nascimento"><input className="input" type="date" value={f.birthDate} onChange={(e) => set({ birthDate: e.target.value })} /></Field>
          <Field label="Sexo">
            <select className="input" value={f.gender} onChange={(e) => set({ gender: e.target.value as 'M' | 'F' | '' })}><option value="">—</option><option value="M">Masculino</option><option value="F">Feminino</option></select>
          </Field>
        </div>
      </div>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Telefone"><input className="input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(11) 90000-0000" /></Field>
      </div>

      <Field label={editing ? 'Modalidades (adicionar)' : 'Modalidades e graduação inicial'}>
        <div className="col gap8">
          {discs.map((d) => {
            const has = existing.has(d.id);
            const on = has || d.id in ranks;
            return (
              <div key={d.id} className="row gap10" style={{ minHeight: 34 }}>
                <div className={'chip' + (on ? ' on' : '')} style={{ ...(on ? { borderColor: d.color, background: soft(d.color) } : {}), cursor: has ? 'default' : 'pointer', minWidth: 150 }}
                  onClick={() => {
                    if (has) return;
                    const r = { ...ranks };
                    if (d.id in r) delete r[d.id];
                    else r[d.id] = 0;
                    setRanks(r);
                    if (!(d.id in ranks) && !f.fee) set({ fee: moneyInput(d.monthlyPrice) });
                  }}>
                  <span className="sq" style={{ width: 7, height: 7, background: d.color }} />{d.name}
                </div>
                {has && <span style={{ fontSize: 12, color: 'var(--mute2)' }}>já matriculado · graduação pela tela de Graduação</span>}
                {!has && d.id in ranks && d.levels.length > 0 && (
                  <select className="input" style={{ width: 200, height: 32 }} value={ranks[d.id]} onChange={(e) => setRanks({ ...ranks, [d.id]: Number(e.target.value) })}>
                    {d.levels.map((l, i) => <option key={i} value={i}>{l.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="Turmas">
        <div className="row wrap gap6">
          {(classes.data?.classes ?? []).filter((c) => chosen.has(c.discipline.id)).map((c) => {
            const on = classIds.includes(c.id);
            const full = !on && c.count >= c.capacity;
            return (
              <div key={c.id} className={'chip' + (on ? ' on' : '')} title={`${c.days} · ${c.time}`}
                style={{ ...(on ? { borderColor: c.discipline.color, background: soft(c.discipline.color) } : {}), opacity: full ? 0.45 : 1, cursor: full ? 'not-allowed' : 'pointer' }}
                onClick={() => !full && setClassIds(on ? classIds.filter((x) => x !== c.id) : [...classIds, c.id])}>
                {c.name}<span style={{ fontSize: 11, color: 'var(--mute2)' }}>{c.count}/{c.capacity}</span>
              </div>
            );
          })}
          {!chosen.size && <span style={{ fontSize: 12.5, color: 'var(--mute2)' }}>Escolha uma modalidade para ver as turmas.</span>}
        </div>
      </Field>

      <div className="grid3" style={{ gap: 12 }}>
        <Field label="Plano">
          <select className="input" value={f.planId} onChange={(e) => { const p = tenant.data?.plans.find((x) => x.id === e.target.value); set({ planId: e.target.value, ...(p ? { fee: moneyInput(p.price) } : {}) }); }}>
            <option value="">Sem plano</option>
            {tenant.data?.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Mensalidade (R$)"><input className="input num" value={f.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Dia de vencimento">
          <select className="input" value={f.dueDay} onChange={(e) => set({ dueDay: Number(e.target.value) })}>
            {(tenant.data?.dueDays ?? [1, 5, 10, 15, 20, 30]).map((d) => <option key={d} value={d}>Dia {String(d).padStart(2, '0')}</option>)}
          </select>
        </Field>
      </div>
      {editing && (
        <Field label="Status">
          <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value as StudentStatus })}>
            <option value="ACTIVE">Ativo</option><option value="LOCKED">Trancado (isento)</option><option value="INACTIVE">Inativo</option>
          </select>
        </Field>
      )}
      {(minor || f.guardianName) && (
        <div className="grid3" style={{ gap: 12 }}>
          <Field label="Responsável"><input className="input" value={f.guardianName} onChange={(e) => set({ guardianName: e.target.value })} /></Field>
          <Field label="Parentesco"><input className="input" value={f.guardianRelation} onChange={(e) => set({ guardianRelation: e.target.value })} placeholder="Mãe, Pai…" /></Field>
          <Field label="Telefone do responsável"><input className="input" value={f.guardianPhone} onChange={(e) => set({ guardianPhone: e.target.value })} /></Field>
        </div>
      )}
      <Field label="Observações médicas">
        <textarea className="input" style={{ height: 64, padding: '8px 12px', resize: 'vertical' }} value={f.medicalNotes} onChange={(e) => set({ medicalNotes: e.target.value })} placeholder="Lesões, alergias, restrições…" />
      </Field>
      <div className="row gap10" style={{ fontSize: 13, cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => set({ consent: !f.consent })}>
        <div className={'toggle' + (f.consent ? ' on' : '')} style={{ flexShrink: 0, marginTop: 1 }}><div /></div>
        <span style={{ lineHeight: 1.5 }}>
          O aluno (ou responsável, se for menor) autorizou o uso destes dados pela academia, inclusive as observações de saúde.
          <span style={{ color: 'var(--mute2)' }}> (LGPD)</span>
        </span>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
