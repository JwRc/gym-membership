import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, patch, post } from '../api/client';
import type { DiscountKind, DiscountRule, DiscountValueType } from '../api/types';
import { Alert, ErrorBox, Field, Loading, Modal, Seg } from '../components/ui';
import { useMutate } from '../modals/useMutate';
import { brl, moneyInput, parseMoney } from '../lib/format';
import { KIND_OPTIONS, ruleText } from '../lib/family';

interface TenantT {
  name: string; code: string; cnpj: string | null; phone: string | null; address: string | null;
  dueDays: number[]; lateToleranceDays: number; autoGenerateInvoices: boolean;
  familyDiscount: DiscountRule;
  plans: { id: string; name: string; description: string | null; price: number }[];
  instructors: { id: string; name: string }[];
  disciplines: { id: string; name: string; color: string; system: string; instructor: string | null; students: number }[];
}
const ALL_DAYS = [1, 5, 10, 15, 20, 25, 30];

export function SettingsPage() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['tenant'], queryFn: () => get<TenantT>('/tenant') });
  const m = useMutate();
  const [editing, setEditing] = useState(false);
  const [instr, setInstr] = useState('');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const t = q.data!;
  const update = (body: Partial<TenantT>, ok = 'Configuração salva') => m.run(() => patch('/tenant', body), ok);
  const row = (k: string, v: React.ReactNode, sub?: string) => (
    <div className="row between gap16" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line2)' }}>
      <div><div style={{ fontSize: 13 }}>{k}</div>{sub && <div style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 2 }}>{sub}</div>}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'right' }}>{v}</div>
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div><h1>Configurações</h1><div className="page-sub">Ajuste o sistema ao jeito da academia</div></div>
      {m.err && <Alert>{m.err}</Alert>}
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="col gap16">
          <div className="card">
            <div className="card-h"><div className="card-t">Academia</div><div className="card-link" onClick={() => setEditing(true)}>Editar</div></div>
            {row('Nome', t.name)}
            {row('CNPJ', t.cnpj ?? '—')}
            {row('Telefone', t.phone ?? '—')}
            {row('Endereço', t.address ?? '—')}
          </div>
          <div className="card">
            <div className="card-h"><div className="card-t">Cobrança</div></div>
            {row('Dias de vencimento disponíveis', (
              <div className="row gap4">
                {ALL_DAYS.map((d) => {
                  const on = t.dueDays.includes(d);
                  return <span key={d} className={'pill ' + (on ? 'pill-ok' : 'pill-mute')} style={{ cursor: 'pointer' }} onClick={() => update({ dueDays: on ? t.dueDays.filter((x) => x !== d) : [...t.dueDays, d] })}>{String(d).padStart(2, '0')}</span>;
                })}
              </div>
            ), 'O aluno escolhe um na matrícula')}
            {row('Tolerância antes de marcar atraso', (
              <select className="input" style={{ width: 110, height: 30 }} value={t.lateToleranceDays} onChange={(e) => update({ lateToleranceDays: Number(e.target.value) })}>
                {[0, 1, 2, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n} dia{n === 1 ? '' : 's'}</option>)}
              </select>
            ), 'Depois disso, aparece em "Atrasadas"')}
            {row('Gerar mensalidades automaticamente', (
              <div className={'toggle' + (t.autoGenerateInvoices ? ' on' : '')} onClick={() => update({ autoGenerateInvoices: !t.autoGenerateInvoices })}><div /></div>
            ), 'Cria os lançamentos do mês seguinte a partir do dia 25')}
          </div>
          <FamilyDiscountCard rule={t.familyDiscount} />
        </div>
        <div className="col gap16">
          <div className="card">
            <div className="card-h"><div className="card-t">Modalidades</div><div className="card-link" onClick={() => nav('/modalidades')}>Gerenciar →</div></div>
            {t.disciplines.map((d) => (
              <div key={d.id} className="row gap12" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line2)' }}>
                <span className="sq" style={{ background: d.color }} />
                <div className="grow"><div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div><div style={{ fontSize: 12, color: 'var(--mute2)' }}>{d.instructor ?? 'Sem professor'} · {d.system}</div></div>
                <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>{d.students} alunos</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-h"><div className="card-t">Professores</div></div>
            {t.instructors.map((i) => <div key={i.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--line2)', fontSize: 13.5 }}>{i.name}</div>)}
            <div className="row gap8" style={{ padding: '10px 18px' }}>
              <input className="input" style={{ height: 32 }} value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Nome do professor" />
              <button className="btn btn-sm" disabled={instr.trim().length < 3} onClick={async () => { if (await m.run(() => post('/tenant/instructors', { name: instr }), 'Professor cadastrado')) setInstr(''); }}>Adicionar</button>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><div className="card-t">Planos</div><div className="card-link" onClick={() => nav('/planos')}>Gerenciar →</div></div>
            {t.plans.map((p) => (
              <div key={p.id} className="row gap12" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line2)' }}>
                <div className="grow"><div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>{p.description && <div style={{ fontSize: 12, color: 'var(--mute2)' }}>{p.description}</div>}</div>
                <span className="num" style={{ fontSize: 13 }}>{brl(p.price)}/mês</span>
              </div>
            ))}
            {!t.plans.length && <div className="empty" style={{ padding: 24 }}>Nenhum plano.</div>}
          </div>
        </div>
      </div>
      {editing && <AcademyModal t={t} onClose={() => setEditing(false)} />}
    </div>
  );
}

function AcademyModal({ t, onClose }: { t: TenantT; onClose: () => void }) {
  const [f, setF] = useState({ name: t.name, cnpj: t.cnpj ?? '', phone: t.phone ?? '', address: t.address ?? '' });
  const m = useMutate();
  return (
    <Modal title="Dados da academia" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={async () => { if (await m.run(() => patch('/tenant', f), 'Dados atualizados')) onClose(); }}>Salvar</button></>}>
      <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="CNPJ"><input className="input" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} /></Field>
        <Field label="Telefone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <Field label="Endereço"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}

/** Desconto família padrão da academia (cada família pode ter o seu). */
function FamilyDiscountCard({ rule }: { rule: DiscountRule }) {
  const [kind, setKind] = useState<DiscountKind>(rule.kind);
  const [vtype, setVtype] = useState<DiscountValueType>(rule.valueType);
  const [value, setValue] = useState(rule.kind === 'NONE' ? '' : rule.valueType === 'PERCENT' ? String(rule.value).replace('.', ',') : moneyInput(rule.value));
  const m = useMutate();
  const dirty = kind !== rule.kind || (kind !== 'NONE' && (vtype !== rule.valueType || parseMoney(value) !== rule.value));
  const save = () => {
    if (kind === 'NONE') return m.run(() => patch('/tenant', { familyDiscountKind: 'NONE' }), 'Desconto família desligado');
    const v = parseMoney(value);
    if (!(v > 0)) return m.setErr('Informe o valor do desconto.');
    if (vtype === 'PERCENT' && v > 100) return m.setErr('O desconto percentual não pode passar de 100%.');
    return m.run(() => patch('/tenant', { familyDiscountKind: kind, familyDiscountType: vtype, familyDiscountValue: v }), 'Desconto família salvo');
  };
  return (
    <div className="card">
      <div className="card-h"><div className="card-t">Desconto família</div></div>
      <div className="col gap12" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 12.5, color: 'var(--mute2)' }}>
          Padrão para todas as famílias; cada família pode ter um desconto próprio ou nenhum. Atual: <span style={{ color: 'var(--text2)' }}>{ruleText(rule)}</span>
        </div>
        <Seg value={kind} onChange={setKind} options={[{ v: 'NONE', label: 'Sem desconto' }, ...KIND_OPTIONS.map((o) => ({ v: o.v, label: o.label }))]} />
        {kind !== 'NONE' && (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--mute2)' }}>{KIND_OPTIONS.find((o) => o.v === kind)?.hint}</div>
            <div className="row gap12">
              <Seg value={vtype} onChange={setVtype} options={[{ v: 'PERCENT', label: '%' }, { v: 'FIXED', label: 'R$' }]} />
              <input className="input num" style={{ width: 140 }} value={value} onChange={(e) => setValue(e.target.value)} placeholder={vtype === 'PERCENT' ? '10' : '0,00'} />
            </div>
          </>
        )}
        {kind === 'FAMILY_FIXED' && <Alert warn>Só vale para famílias com cobrança consolidada; as separadas que usam o padrão ficam sem desconto.</Alert>}
        {m.err && <Alert>{m.err}</Alert>}
        <div className="row between gap12">
          <span style={{ fontSize: 12, color: 'var(--mute2)' }}>Vale para as próximas mensalidades geradas (o mês seguinte é gerado a partir do dia 25).</span>
          <button className="btn btn-sm btn-primary" disabled={!dirty || m.busy} onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
