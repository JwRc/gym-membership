import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
import type { InvoiceRow, StudentDetail, StudentInvoices } from '../api/types';
import { Avatar, ErrorBox, Loading } from '../components/ui';
import { InvoicesTable, InvoiceStats } from '../components/InvoiceBlocks';
import { LaunchInvoiceModal, PayInvoiceModal } from '../modals/basic';
import { planLine } from './StudentProfile';

export function StudentFinancePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['student', id], queryFn: () => get<StudentDetail>(`/students/${id}`) });
  const [launch, setLaunch] = useState(false);
  const [pay, setPay] = useState<InvoiceRow | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const inv: StudentInvoices = s.invoices;
  return (
    <div className="page">
      <div className="crumbs">
        <span className="link" onClick={() => nav('/alunos')}>Alunos</span><span>/</span>
        <span className="link" onClick={() => nav(`/alunos/${s.id}`)}>{s.name}</span><span>/</span><span style={{ color: 'var(--text)' }}>Financeiro</span>
      </div>
      <div className="row gap16">
        <Avatar name={s.name} initials={s.initials} size={48} />
        <div className="grow">
          <h1 style={{ fontSize: 22, letterSpacing: '-0.02em' }}>Financeiro · {s.name}</h1>
          <div className="page-sub">{planLine(s)}</div>
        </div>
        <button className="btn" onClick={() => nav(`/alunos/${s.id}`)}>Ver ficha</button>
        <button className="btn btn-primary" onClick={() => setLaunch(true)}>Lançar mensalidade</button>
      </div>
      <InvoiceStats inv={inv} />
      <InvoicesTable inv={inv} action="Registrar pagamento" onPay={setPay} />
      {launch && <LaunchInvoiceModal student={s} onClose={() => setLaunch(false)} />}
      {pay && <PayInvoiceModal invoice={{ ...pay, name: s.name }} onClose={() => setPay(null)} />}
    </div>
  );
}
