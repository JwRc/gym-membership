import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
import type { FamilyRow } from '../api/types';
import { Avatar, ErrorBox, FinancePill, ICONS, Icon, Loading } from '../components/ui';
import { FamilyModal } from '../modals/FamilyModal';
import { useApp } from '../auth/AppContext';
import { brl } from '../lib/format';
import { ruleText } from '../lib/family';

const COLS = 'minmax(220px,1.6fr) minmax(200px,1.6fr) 150px minmax(170px,1.2fr) 170px 24px';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function FamiliesPage() {
  const nav = useNavigate();
  const { can } = useApp();
  const q = useQuery({ queryKey: ['families'], queryFn: () => get<FamilyRow[]>('/families') });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const all = q.data!;
  const s = norm(search.trim());
  const rows = s ? all.filter((f) => [f.name, f.guardian.name, ...f.members.map((m) => m.name)].some((x) => norm(x).includes(s))) : all;
  const members = all.reduce((n, f) => n + f.activeMembers, 0);

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Famílias</h1>
          <div className="page-sub">{all.length} famílias · {members} alunos ativos em famílias · o titular responde pela conta e pela cobrança</div>
        </div>
        {can('families.write') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon d={ICONS.plus} size={14} width={2.2} />Nova família</button>}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
          <div className="row gap8" style={{ maxWidth: 360 }}>
            <Icon d={ICONS.search} size={14} stroke="var(--mute2)" />
            <input className="input" style={{ height: 32 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por família, titular ou membro…" />
          </div>
        </div>
        <div className="thead" style={{ gridTemplateColumns: COLS }}><div>Família</div><div>Membros</div><div>Cobrança</div><div>Desconto</div><div>Financeiro</div><div /></div>
        {rows.map((f) => (
          <div key={f.id} className="trow click" style={{ gridTemplateColumns: COLS }} onClick={() => nav(`/familias/${f.id}`)}>
            <div style={{ minWidth: 0 }}>
              <div className="ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{f.name}</div>
              <div className="ellipsis" style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 1 }}>Titular: {f.guardian.name}{f.guardian.trains ? ' · treina' : ''}</div>
            </div>
            <div className="row gap6" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 0 }}>
                {f.members.slice(0, 4).map((m, i) => (
                  <div key={m.id} style={{ marginLeft: i ? -6 : 0, opacity: m.status === 'ACTIVE' ? 1 : 0.5 }}><Avatar name={m.name} size={24} ring="var(--card)" /></div>
                ))}
              </div>
              <span className="ellipsis" style={{ fontSize: 12.5, color: 'var(--mute)' }}>
                {f.members.length ? `${f.members.length} membro${f.members.length > 1 ? 's' : ''}` : 'Sem membros'}
              </span>
            </div>
            <div style={{ fontSize: 13 }}>
              {f.billingMode === 'CONSOLIDATED' ? <>Consolidada<div style={{ fontSize: 12, color: 'var(--mute2)' }}>dia {String(f.dueDay).padStart(2, '0')}</div></> : 'Separada'}
            </div>
            <div style={{ fontSize: 12.5, color: f.rule.kind === 'NONE' ? 'var(--mute2)' : 'var(--text2)' }}>
              {ruleText(f.rule)}
              {f.discountOverride === 'CUSTOM' && <span className="pill pill-mute" style={{ marginLeft: 6, fontSize: 10.5, padding: '1px 6px' }}>Própria</span>}
            </div>
            <div className="col" style={{ gap: 2, alignItems: 'flex-start' }}>
              <FinancePill f={f.finance} />
              {f.openAmount > 0 && <span className="num" style={{ fontSize: 11.5, color: 'var(--mute2)' }}>{brl(f.openAmount)} em aberto</span>}
            </div>
            <Icon d={ICONS.chevR} size={14} stroke="var(--mute2)" />
          </div>
        ))}
        {!rows.length && (
          <div className="empty">
            {all.length ? 'Nenhuma família encontrada.' : 'Nenhuma família ainda. Agrupe alunos da mesma família para ter um titular, cobrança única e desconto família.'}
          </div>
        )}
      </div>
      {creating && <FamilyModal onClose={() => setCreating(false)} />}
    </div>
  );
}
