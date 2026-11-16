import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { del, get, patch, post } from '../api/client';
import type { ClassGroup, DisciplineT, Plan } from '../api/types';
import { Alert, Field, Modal } from '../components/ui';
import { brl, moneyInput, parseMoney } from '../lib/format';
import { soft } from '../lib/theme';
import { useMutate } from './useMutate';

/** Criar/editar plano: valor, modalidades (matrícula automática) e turmas (opcional). */
export function PlanModal({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const disc = useQuery({ queryKey: ['disciplines'], queryFn: () => get<{ disciplines: DisciplineT[] }>('/disciplines') });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => get<{ classes: ClassGroup[] }>('/classes') });
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDesc] = useState(plan?.description ?? '');
  const [price, setPrice] = useState(plan ? moneyInput(plan.price) : '');
  const [discIds, setDiscIds] = useState<string[]>(plan?.disciplines.map((d) => d.id) ?? []);
  const [classIds, setClassIds] = useState<string[]>(plan?.classGroups.map((c) => c.id) ?? []);
  const [apply, setApply] = useState(true);
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const m = useMutate();

  const discs = disc.data?.disciplines ?? [];
  const groups = (classes.data?.classes ?? []).filter((c) => discIds.includes(c.discipline.id));
  const before = { d: new Set(plan?.disciplines.map((d) => d.id)), c: new Set(plan?.classGroups.map((c) => c.id)) };
  const addedSomething = !!plan && (discIds.some((id) => !before.d.has(id)) || classIds.some((id) => !before.c.has(id)));
  const current = plan?.students.length ?? 0;
  const sum = discs.filter((d) => discIds.includes(d.id)).reduce((n, d) => n + d.monthlyPrice, 0);

  const toggleDisc = (id: string) => {
    if (discIds.includes(id)) {
      setDiscIds(discIds.filter((x) => x !== id));
      // turmas da modalidade saem junto
      const drop = new Set((classes.data?.classes ?? []).filter((c) => c.discipline.id === id).map((c) => c.id));
      setClassIds(classIds.filter((x) => !drop.has(x)));
    } else setDiscIds([...discIds, id]);
  };

  const save = async () => {
    const value = parseMoney(price);
    if (!(value >= 0)) return m.setErr('Informe o valor do plano.');
    const body = { name, description: description || undefined, price: value, disciplineIds: discIds, classGroupIds: classIds };
    const r = plan
      ? await m.run(
          () => patch<{ affected: number; warnings: string[] }>(`/plans/${plan.id}`, { ...body, applyToCurrent: addedSomething && current > 0 && apply }),
          (r) => [`${name} salvo`, r.affected ? `${r.affected} aluno(s) atualizado(s)` : '', ...r.warnings].filter(Boolean).join(' · '),
        )
      : await m.run(() => post('/plans', body), `${name} criado`);
    if (r) onClose();
  };
  const archive = async () => {
    if (confirm !== 'archive') return setConfirm('archive');
    if (await m.run(() => post(`/plans/${plan!.id}/archive`), `${plan!.name} arquivado`)) onClose();
  };
  const remove = async () => {
    if (confirm !== 'delete') return setConfirm('delete');
    if (await m.run(() => del(`/plans/${plan!.id}`), `${plan!.name} excluído`)) onClose();
  };

  return (
    <Modal width={600} onClose={onClose} title={plan ? `Editar ${plan.name}` : 'Novo plano'}
      footer={
        <>
          {plan && !plan.archived && (current
            ? <button className="btn" style={{ marginRight: 'auto', color: confirm === 'archive' ? 'var(--bad)' : undefined }} disabled={m.busy} onClick={archive}>{confirm === 'archive' ? 'Confirmar arquivamento' : 'Arquivar'}</button>
            : <button className="btn" style={{ marginRight: 'auto', color: confirm === 'delete' ? 'var(--bad)' : undefined }} disabled={m.busy} onClick={remove}>{confirm === 'delete' ? 'Confirmar exclusão' : 'Excluir'}</button>)}
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={m.busy || name.trim().length < 2} onClick={save}>{plan ? 'Salvar' : 'Criar plano'}</button>
        </>
      }>
      {plan?.archived && <Alert warn>Plano arquivado: não aparece no cadastro de alunos. Restaure pela lista de planos.</Alert>}
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Combo Jiu-jitsu + Muay Thai" autoFocus={!plan} /></Field>
        <Field label="Valor mensal (R$)" hint={discIds.length > 1 && sum ? `Avulsas somariam ${brl(sum)}` : undefined}>
          <input className="input num" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
        </Field>
      </div>
      <Field label="Descrição"><input className="input" value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Livre acesso às turmas da noite" /></Field>

      <Field label="Modalidades" hint="Quem entrar no plano é matriculado nelas, na graduação inicial (se ainda não tiver).">
        <div className="row wrap gap6">
          {discs.map((d) => {
            const on = discIds.includes(d.id);
            return (
              <div key={d.id} className={'chip' + (on ? ' on' : '')} style={on ? { borderColor: d.color, background: soft(d.color) } : undefined} onClick={() => toggleDisc(d.id)}>
                <span className="sq" style={{ width: 7, height: 7, background: d.color }} />{d.name}
              </div>
            );
          })}
          {!discs.length && <span style={{ fontSize: 12.5, color: 'var(--mute2)' }}>Cadastre modalidades primeiro.</span>}
        </div>
      </Field>

      <Field label="Turmas automáticas (opcional)" hint="Quem entrar no plano vai direto para elas. Turma lotada é pulada, com aviso. Ao trocar de plano, o aluno sai das turmas do plano anterior.">
        <div className="row wrap gap6">
          {groups.map((c) => {
            const on = classIds.includes(c.id);
            return (
              <div key={c.id} className={'chip' + (on ? ' on' : '')} title={`${c.days} · ${c.time}`}
                style={on ? { borderColor: c.discipline.color, background: soft(c.discipline.color) } : undefined}
                onClick={() => setClassIds(on ? classIds.filter((x) => x !== c.id) : [...classIds, c.id])}>
                {c.name}<span style={{ fontSize: 11, color: c.count >= c.capacity ? 'var(--bad)' : 'var(--mute2)' }}>{c.count}/{c.capacity}</span>
              </div>
            );
          })}
          {!discIds.length && <span style={{ fontSize: 12.5, color: 'var(--mute2)' }}>Escolha uma modalidade para ver as turmas.</span>}
          {!!discIds.length && !groups.length && <span style={{ fontSize: 12.5, color: 'var(--mute2)' }}>Nenhuma turma nessas modalidades.</span>}
        </div>
      </Field>

      {addedSomething && current > 0 && (
        <div className="row gap10" style={{ fontSize: 13, cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => setApply(!apply)}>
          <div className={'toggle' + (apply ? ' on' : '')} style={{ flexShrink: 0, marginTop: 1 }}><div /></div>
          <span style={{ lineHeight: 1.5 }}>
            Aplicar o que foi adicionado aos {current} aluno(s) atuais do plano
            <span style={{ color: 'var(--mute2)' }}> · só adiciona, ninguém é removido</span>
          </span>
        </div>
      )}
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
