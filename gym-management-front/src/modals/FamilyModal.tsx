import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, patch, post } from '../api/client';
import type { BillingMode, DiscountKind, DiscountOverride, DiscountRule, DiscountValueType, FamilyDetail, StudentRow } from '../api/types';
import { Alert, Avatar, Field, Modal, Seg } from '../components/ui';
import { moneyInput, parseMoney } from '../lib/format';
import { KIND_OPTIONS, ruleText } from '../lib/family';
import { useMutate } from './useMutate';

interface TenantT {
  dueDays: number[];
  familyDiscount: DiscountRule;
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const surname = (n: string) => n.trim().split(/\s+/).slice(-1)[0] ?? '';
const valueText = (t: DiscountValueType, v: number) => (t === 'PERCENT' ? String(v).replace('.', ',') : moneyInput(v));

/** Cria ou edita a família: titular, membros (na criação), cobrança e desconto. */
export function FamilyModal({ family, onClose }: { family?: FamilyDetail; onClose: () => void }) {
  const nav = useNavigate();
  const editing = !!family;
  const tenant = useQuery({ queryKey: ['tenant'], queryFn: () => get<TenantT>('/tenant') });
  const students = useQuery({ queryKey: ['students', 'all'], queryFn: () => get<{ rows: StudentRow[] }>('/students?status=all') });
  const custom = family?.customRule;

  const [g, setG] = useState({
    name: family?.guardian.name ?? '',
    email: family?.guardian.email ?? '',
    phone: family?.guardian.phone ?? '',
    cpf: family?.guardian.cpf ?? '',
    relation: family?.guardian.relation ?? '',
    studentId: family?.guardian.studentId ?? '',
  });
  const [trains, setTrains] = useState(!!family?.guardian.studentId);
  const [name, setName] = useState(family?.name ?? '');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<BillingMode>(family?.billingMode ?? 'CONSOLIDATED');
  const [dueDay, setDueDay] = useState<number | ''>(family?.dueDay ?? '');
  const [override, setOverride] = useState<DiscountOverride>(family?.discountOverride ?? 'INHERIT');
  const [kind, setKind] = useState<Exclude<DiscountKind, 'NONE'>>((custom?.kind as Exclude<DiscountKind, 'NONE'>) ?? 'STATIC');
  const [vtype, setVtype] = useState<DiscountValueType>(custom?.valueType ?? 'PERCENT');
  const [value, setValue] = useState(custom ? valueText(custom.valueType, custom.value) : '');
  const m = useMutate();

  const setGuard = (p: Partial<typeof g>) => setG((x) => ({ ...x, ...p }));
  const dueDays = tenant.data?.dueDays ?? [];
  const tenantRule = tenant.data?.familyDiscount;
  // aluno sem família (ou desta família) pode entrar
  const free = (students.data?.rows ?? []).filter((s) => !s.family || s.family.id === family?.id);
  const pick = free.filter((s) => !memberIds.includes(s.id) && s.id !== g.studentId && (!search || norm(s.name).includes(norm(search)))).slice(0, 8);
  const byId = new Map((students.data?.rows ?? []).map((s) => [s.id, s]));

  const chooseMode = (v: BillingMode) => {
    setMode(v);
    if (v === 'SEPARATE' && kind === 'FAMILY_FIXED') setKind('STATIC');
  };
  // sem escolha ainda: dia 10 (ou o primeiro da academia)
  const due = dueDay !== '' ? dueDay : dueDays.includes(10) ? 10 : (dueDays[0] ?? '');

  const save = async () => {
    if (g.name.trim().length < 3) return m.setErr('Informe o nome do titular.');
    if (!g.email.trim()) return m.setErr('Informe o e-mail do titular.');
    if (trains && !g.studentId) return m.setErr('Escolha o cadastro de aluno do titular.');
    if (mode === 'CONSOLIDATED' && !due) return m.setErr('Escolha o dia de vencimento da cobrança da família.');
    let rule = {};
    if (override === 'CUSTOM') {
      const v = parseMoney(value);
      if (!(v > 0)) return m.setErr('Informe o valor do desconto.');
      if (vtype === 'PERCENT' && v > 100) return m.setErr('O desconto percentual não pode passar de 100%.');
      rule = { discountKind: kind, discountType: vtype, discountValue: v };
    }
    const body = {
      name: name.trim() || undefined,
      guardian: {
        name: g.name, email: g.email, phone: g.phone || null, cpf: g.cpf || null, relation: g.relation || null,
        studentId: trains ? g.studentId : null,
      },
      billingMode: mode,
      dueDay: mode === 'CONSOLIDATED' ? due : null,
      discountOverride: override,
      ...rule,
    };
    if (editing) {
      if (await m.run(() => patch(`/families/${family!.id}`, body), 'Família atualizada')) onClose();
    } else {
      const r = await m.run(() => post<{ id: string }>('/families', { ...body, memberIds }), 'Família criada');
      if (r) {
        onClose();
        nav(`/familias/${r.id}`);
      }
    }
  };

  return (
    <Modal title={editing ? 'Editar família' : 'Nova família'} sub={editing ? family!.name : 'Titular responsável pela conta, membros e cobrança'} width={640} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>{editing ? 'Salvar' : 'Criar família'}</button></>}>
      <div className="field-l" style={{ marginBottom: -4 }}>Titular</div>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Nome completo"><input className="input" value={g.name} onChange={(e) => setGuard({ name: e.target.value })} autoFocus /></Field>
        <Field label="E-mail" hint="Será o acesso da família ao portal."><input className="input" type="email" value={g.email} onChange={(e) => setGuard({ email: e.target.value })} /></Field>
      </div>
      <div className="grid3" style={{ gap: 12 }}>
        <Field label="Telefone"><input className="input" value={g.phone} onChange={(e) => setGuard({ phone: e.target.value })} placeholder="(11) 90000-0000" /></Field>
        <Field label="CPF (opcional)"><input className="input" value={g.cpf} onChange={(e) => setGuard({ cpf: e.target.value })} placeholder="000.000.000-00" /></Field>
        <Field label="Parentesco"><input className="input" value={g.relation} onChange={(e) => setGuard({ relation: e.target.value })} placeholder="Mãe, Pai…" /></Field>
      </div>
      <div className="row gap10" style={{ fontSize: 13, cursor: 'pointer' }} onClick={() => setTrains(!trains)}>
        <div className={'toggle' + (trains ? ' on' : '')} style={{ flexShrink: 0 }}><div /></div>
        <span>O titular também treina (já é aluno)</span>
      </div>
      {trains && (
        <Field label="Cadastro de aluno do titular" hint="Ele entra como membro da família e conta para o desconto.">
          <select className="input" value={g.studentId} onChange={(e) => setGuard({ studentId: e.target.value })}>
            <option value="">Escolha…</option>
            {free.filter((s) => s.status !== 'INACTIVE' || s.id === g.studentId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      )}

      {!editing && (
        <Field label="Membros (alunos já cadastrados)" hint="Também dá para cadastrar alunos novos direto na família depois de criá-la.">
          <div className="col gap8">
            {!!memberIds.length && (
              <div className="row wrap gap6">
                {memberIds.map((id) => (
                  <div key={id} className="chip on" onClick={() => setMemberIds(memberIds.filter((x) => x !== id))} title="Remover">
                    <Avatar name={byId.get(id)?.name ?? '?'} size={20} />{byId.get(id)?.name}<span style={{ color: 'var(--mute2)' }}>×</span>
                  </div>
                ))}
              </div>
            )}
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno sem família…" />
            {search && (
              <div className="row wrap gap6">
                {pick.map((s) => (
                  <div key={s.id} className="chip" onClick={() => { setMemberIds([...memberIds, s.id]); setSearch(''); }}>
                    <Avatar name={s.name} initials={s.initials} size={20} />{s.name}<span style={{ fontSize: 11, color: 'var(--mute2)' }}>{s.age} anos</span>
                  </div>
                ))}
                {!pick.length && <span style={{ fontSize: 12.5, color: 'var(--mute2)' }}>Nenhum aluno sem família com esse nome.</span>}
              </div>
            )}
          </div>
        </Field>
      )}
      <Field label="Nome da família">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={g.name.trim() ? `Família ${surname(g.name)}` : 'Família Souza'} />
      </Field>

      <div className="field-l" style={{ marginBottom: -4, marginTop: 4 }}>Cobrança</div>
      <Seg large value={mode} onChange={chooseMode} options={[{ v: 'CONSOLIDATED', label: 'Consolidada (uma cobrança)' }, { v: 'SEPARATE', label: 'Separada (por aluno)' }]} />
      {mode === 'CONSOLIDATED' ? (
        <Field label="Dia de vencimento da família" hint="Uma cobrança por mês com as mensalidades de todos; o pagamento é registrado pela família.">
          <select className="input" value={due} onChange={(e) => setDueDay(Number(e.target.value))}>
            {dueDays.map((d) => <option key={d} value={d}>Dia {String(d).padStart(2, '0')}</option>)}
          </select>
        </Field>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--mute2)' }}>Cada membro mantém a sua mensalidade e o seu dia de vencimento, já com o desconto família.</div>
      )}

      <div className="field-l" style={{ marginBottom: -4, marginTop: 4 }}>Desconto família</div>
      <Seg value={override} onChange={setOverride} options={[
        { v: 'INHERIT', label: 'Padrão da academia' },
        { v: 'CUSTOM', label: 'Personalizado' },
        { v: 'NONE', label: 'Sem desconto' },
      ]} />
      {override === 'INHERIT' && (
        <div style={{ fontSize: 12.5, color: 'var(--mute)' }}>
          {ruleText(tenantRule)}
          {tenantRule?.kind === 'FAMILY_FIXED' && mode === 'SEPARATE' && <Alert warn>O padrão da academia é sobre o total da família e só vale na cobrança consolidada: esta família ficará sem desconto.</Alert>}
        </div>
      )}
      {override === 'CUSTOM' && (
        <>
          <Seg value={kind} onChange={setKind} options={KIND_OPTIONS.filter((o) => mode === 'CONSOLIDATED' || o.v !== 'FAMILY_FIXED').map((o) => ({ v: o.v, label: o.label }))} />
          <div style={{ fontSize: 12.5, color: 'var(--mute2)', marginTop: -4 }}>{KIND_OPTIONS.find((o) => o.v === kind)?.hint}</div>
          <div className="row gap12">
            <Seg value={vtype} onChange={setVtype} options={[{ v: 'PERCENT', label: '%' }, { v: 'FIXED', label: 'R$' }]} />
            <input className="input num" style={{ width: 140 }} value={value} onChange={(e) => setValue(e.target.value)} placeholder={vtype === 'PERCENT' ? '10' : '0,00'} />
          </div>
        </>
      )}
      {editing && <div style={{ fontSize: 12, color: 'var(--mute2)' }}>Mudanças na cobrança e no desconto valem a partir das próximas mensalidades geradas.</div>}
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
