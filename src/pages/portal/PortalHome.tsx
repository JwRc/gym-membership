import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../api/client';
import type { StudentDetail } from '../../api/types';
import { ErrorBox, FinancePill, Loading } from '../../components/ui';
import { ClassesCard, RankCard } from '../../components/StudentBlocks';
import { br, brl, firstName, longDate } from '../../lib/format';
import { soft } from '../../lib/theme';
import { personalData } from '../StudentProfile';

export function PortalHomePage() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['me'], queryFn: () => get<StudentDetail>('/me') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const inv = s.invoices.summary;
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <div className="page-h">
        <div><div style={{ fontSize: 13, color: 'var(--mute)' }}>{longDate()}</div><h1 style={{ marginTop: 4 }}>Olá, {firstName(s.name)}</h1></div>
        <div className="row gap6">{s.ranks.map((r) => <span key={r.discipline.id} className="pill" style={{ background: soft(r.discipline.color), color: r.discipline.color }}>{r.discipline.name}</span>)}</div>
      </div>
      <div className="grid3">
        <div className="card">
          <div className="card-h"><div className="card-t">Próxima aula</div>{s.nextClass && <span className="pill pill-blue">{s.nextClass.inText}</span>}</div>
          {s.nextClass ? (
            <div className="row gap12" style={{ padding: 18 }}>
              <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: s.nextClass.color }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{s.nextClass.name}</div>
                <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 4 }}>{s.nextClass.when}</div>
                <div style={{ fontSize: 12.5, color: 'var(--mute)', marginTop: 2 }}>{s.nextClass.instructor}</div>
              </div>
            </div>
          ) : <div className="empty" style={{ padding: 28 }}>Você ainda não está em nenhuma turma.</div>}
        </div>
        <div className="card">
          <div className="card-h"><div className="card-t">Mensalidade</div><FinancePill f={s.finance} /></div>
          <div style={{ padding: 18 }}>
            <div className="stat-v" style={{ marginTop: 0 }}>{brl(inv.monthlyFee)}</div>
            <div className="stat-s">Vence todo dia {String(inv.dueDay).padStart(2, '0')}{inv.next ? ` · próximo ${br(inv.next.dueDate)}` : ''}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div className="card-t">Em aberto</div><div className="card-link" onClick={() => nav('/mensalidades')}>Ver mensalidades →</div></div>
          <div style={{ padding: 18 }}>
            <div className="stat-v" style={{ marginTop: 0, color: inv.open ? 'var(--bad)' : 'var(--ok)' }}>{brl(inv.open)}</div>
            <div className="stat-s">{inv.openCount ? `${inv.openCount} mensalidade(s) para pagar` : 'Tudo em dia'}</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,7fr) minmax(0,5fr)', gap: 16, alignItems: 'start' }}>
        <RankCard ranks={s.ranks} />
        <div className="col gap16">
          <ClassesCard classes={s.classes} title="Minhas turmas" empty="Você ainda não está em nenhuma turma." />
          <div className="card">
            <div className="card-h"><div className="card-t">Meus dados</div><span style={{ fontSize: 12, color: 'var(--mute2)' }}>Para corrigir, fale com a recepção</span></div>
            {personalData(s).slice(0, 5).map(([k, v]) => (
              <div key={k} className="row between gap12" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line2)', fontSize: 13 }}>
                <span style={{ color: 'var(--mute)' }}>{k}</span><span className="ellipsis">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
