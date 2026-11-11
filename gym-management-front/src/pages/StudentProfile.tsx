import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { errMsg, get } from '../api/client';
import type { StudentDetail } from '../api/types';
import { Avatar, ErrorBox, FinancePill, InvoicePill, Loading, StatusPill } from '../components/ui';
import { RankCard, ClassesCard } from '../components/StudentBlocks';
import { GraduationModal } from '../modals/basic';
import { StudentModal } from '../modals/StudentModal';
import { AnonymizeModal } from '../modals/AnonymizeModal';
import { useApp } from '../auth/AppContext';
import { br, brl, fileSlug, saveBlob } from '../lib/format';
import { soft } from '../lib/theme';

export function personalData(s: StudentDetail) {
  return [
    ['Nascimento', `${br(s.birthDate)} · ${s.age} anos`],
    ['E-mail', s.email],
    ['Telefone', s.phone ?? '—'],
    ['Aluno desde', `${br(s.startDate)} · ${s.since}`],
    ['Vencimento', `Todo dia ${String(s.dueDay).padStart(2, '0')}`],
    ['Consentimento (LGPD)', s.consentAt ? `Autorizado em ${br(s.consentAt.slice(0, 10))}` : 'Não registrado'],
  ];
}
export const planLine = (s: StudentDetail) => `${s.plan?.name ?? 'Sem plano'} · ${brl(s.monthlyFee)}/mês · vence dia ${String(s.dueDay).padStart(2, '0')}`;

export function StudentProfilePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['student', id], queryFn: () => get<StudentDetail>(`/students/${id}`) });
  const { can, toast } = useApp();
  const [modal, setModal] = useState<null | 'edit' | 'anonymize' | { grad: string }>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const firstGrad = s.ranks.find((r) => r.next);

  return (
    <div className="page">
      <div className="crumbs"><span className="link" onClick={() => nav('/alunos')}>Alunos</span><span>/</span><span style={{ color: 'var(--text)' }}>{s.name}</span></div>
      <div className="row gap16">
        <Avatar name={s.name} initials={s.initials} size={56} />
        <div className="grow">
          <div className="row gap10">
            <h1 style={{ fontSize: 22, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{s.name}</h1>
            <StatusPill s={s.status} />
            <FinancePill f={s.finance} />
          </div>
          <div className="row gap8 wrap" style={{ marginTop: 6, fontSize: 13, color: 'var(--mute)' }}>
            {s.ranks.map((r) => <span key={r.discipline.id} className="pill" style={{ background: soft(r.discipline.color), color: r.discipline.color }}>{r.discipline.name}</span>)}
            <span>·</span><span>Aluno há {s.since}</span><span>·</span><span>{planLine(s)}</span>
          </div>
        </div>
        <button className="btn" onClick={() => nav(`/alunos/${s.id}/financeiro`)}>Financeiro</button>
        <button className="btn" onClick={() => setModal('edit')}>Editar</button>
        {can('students.export') && (
          <button className="btn" onClick={() => get<unknown>(`/students/${s.id}/export`)
            .then((d) => saveBlob(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), `dados-${fileSlug(s.name)}.json`))
            .catch((e) => toast(errMsg(e), true))}>Exportar dados</button>
        )}
        {firstGrad && <button className="btn btn-primary" onClick={() => setModal({ grad: firstGrad.discipline.id })}>Registrar graduação</button>}
      </div>

      <div className="card" style={{ padding: '16px 18px' }}>
        <div className="card-t" style={{ marginBottom: 14 }}>Dados pessoais</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '14px 24px' }}>
          {personalData(s).map(([k, v]) => (
            <div key={k} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--mute2)' }}>{k}</div>
              <div className="ellipsis" style={{ fontSize: 13.5, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
        {s.guardian && (
          <div className="row gap10" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', fontSize: 13 }}>
            <span style={{ color: 'var(--mute2)', fontSize: 12, width: 130 }}>Responsável</span>
            <span>{s.guardian.name} <span style={{ color: 'var(--mute)' }}>· {s.guardian.relation} · </span><span className="mono" style={{ fontSize: 12.5 }}>{s.guardian.phone}</span></span>
          </div>
        )}
        <div className="row gap10" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', fontSize: 13, alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--mute2)', fontSize: 12, width: 130, flexShrink: 0 }}>Observações médicas</span>
          <span style={{ color: s.medicalNotes ? 'var(--warn)' : 'var(--mute)', lineHeight: 1.5 }}>{s.medicalNotes ?? 'Nenhuma observação.'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,7fr) minmax(0,5fr)', gap: 16, alignItems: 'start' }}>
        <div className="col gap16">
          <RankCard ranks={s.ranks} onGrad={(d) => setModal({ grad: d })} />
          <ClassesCard classes={s.classes} empty="Sem turmas ativas." />
        </div>
        <div className="card">
          <div className="card-h">
            <div className="card-t">Mensalidades</div>
            <div className="card-link" onClick={() => nav(`/alunos/${s.id}/financeiro`)}>Abrir financeiro</div>
          </div>
          <div className="thead" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1.2fr' }}><div>Referência</div><div>Vencimento</div><div>Valor</div><div>Status</div></div>
          {s.invoices.rows.slice(0, 6).map((m) => (
            <div key={m.id} className="trow" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1.2fr', minHeight: 44, fontSize: 13 }}>
              <div>{m.ref}</div><div className="num muted">{br(m.dueDate)}</div><div className="num">{brl(m.amount)}</div>
              <div><InvoicePill state={m.state} label={m.label} /></div>
            </div>
          ))}
          {!s.invoices.rows.length && <div className="empty">Nenhuma mensalidade lançada.</div>}
          <div className="card-foot" style={{ cursor: 'pointer' }} onClick={() => nav(`/alunos/${s.id}/financeiro`)}>
            <span>{s.invoices.summary.openCount ? `${brl(s.invoices.summary.open)} em aberto` : 'Nada em aberto'}</span>
            <span style={{ color: 'var(--sub)' }}>Lançar mensalidades →</span>
          </div>
        </div>
      </div>

      {can('students.delete') && (
        <div style={{ fontSize: 12.5, color: 'var(--mute2)' }}>
          LGPD: <span className="link" style={{ color: 'var(--bad)', cursor: 'pointer' }} onClick={() => setModal('anonymize')}>remover os dados pessoais deste aluno</span>, a pedido do titular.
        </div>
      )}
      {modal === 'edit' && <StudentModal student={s} onClose={() => setModal(null)} />}
      {modal === 'anonymize' && <AnonymizeModal student={s} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <GraduationModal disciplineId={modal.grad} studentId={s.id} onClose={() => setModal(null)} />}
    </div>
  );
}
