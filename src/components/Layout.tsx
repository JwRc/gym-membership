import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
import { useApp } from '../auth/AppContext';
import { Avatar, ICONS, Icon } from './ui';

interface TenantLite {
  disciplines: { id: string; name: string; color: string; students: number }[];
}
interface DashLite {
  late: { count: number };
  eligible: { count: number };
}

export function Layout() {
  const { me, theme, toggleTheme, logout } = useApp();
  const nav = useNavigate();
  const admin = me!.role === 'ADMIN';
  const tenant = useQuery({ queryKey: ['tenant'], queryFn: () => get<TenantLite>('/tenant'), enabled: admin });
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => get<DashLite>('/dashboard'), enabled: admin });

  useEffect(() => {
    if (!admin) return;
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        nav('/alunos?focus=1');
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [admin, nav]);

  const items = admin
    ? [
        ['/', 'Início', ICONS.inicio, 0],
        ['/alunos', 'Alunos', ICONS.alunos, 0],
        ['/turmas', 'Turmas', ICONS.turmas, 0],
        ['/graduacao', 'Graduação', ICONS.grad, dash.data?.eligible.count ?? 0, 'gold'],
        ['/financeiro', 'Financeiro', ICONS.fin, dash.data?.late.count ?? 0, 'bad'],
        ['/loja', 'Loja', ICONS.loja, 0],
        ['/modalidades', 'Modalidades', ICONS.mods, 0],
        ['/configuracoes', 'Configurações', ICONS.config, 0],
      ]
    : [
        ['/', 'Início', ICONS.inicio, 0],
        ['/mensalidades', 'Mensalidades', ICONS.fin, 0],
      ];

  const mods = tenant.data?.disciplines;
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="logo">{me!.tenant.initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className="ellipsis" style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{me!.tenant.name}</div>
            <div className="ellipsis" style={{ fontSize: 11, color: 'var(--mute2)', marginTop: 1 }}>
              {me!.tenant.disciplines.join(' · ') || 'Sem modalidades'}
            </div>
          </div>
        </div>
        {admin && (
          <div className="search-btn" onClick={() => nav('/alunos?focus=1')}>
            <Icon d={ICONS.search} size={14} width={2} />
            <span style={{ flex: 1 }}>Buscar aluno</span>
            <span className="kbd">Ctrl K</span>
          </div>
        )}
        <nav className="col" style={{ gap: 2 }}>
          {items.map(([to, label, icon, badge, tone]) => (
            <NavLink key={to as string} to={to as string} end={to === '/'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Icon d={icon as string} />
              <span style={{ flex: 1 }}>{label}</span>
              {!!badge && (
                <span
                  className="nav-badge"
                  style={tone === 'gold' ? { background: 'rgba(217,164,65,0.14)', color: 'var(--gold)' } : { background: 'rgba(229,72,77,0.16)', color: 'var(--bad)' }}
                >
                  {badge as number}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        {admin && !!mods?.length && (
          <>
            <div className="side-label">Modalidades</div>
            <div className="col" style={{ gap: 2, marginTop: 8 }}>
              {mods.map((m) => (
                <div key={m.id} className="side-mod">
                  <span className="sq" style={{ background: m.color, borderRadius: 3 }} />
                  <span style={{ flex: 1 }}>{m.name}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--mute2)' }}>{m.students}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ flex: 1 }} />
        <div className="side-user">
          <Avatar name={me!.name} />
          <div className="grow">
            <div className="ellipsis" style={{ fontSize: 13, fontWeight: 500 }}>{me!.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--mute2)' }}>{admin ? 'Administrador' : 'Aluno'}</div>
          </div>
          <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
            <Icon d={theme === 'dark' ? ICONS.sun : ICONS.moon} size={15} width={1.9} />
          </button>
          <button className="icon-btn" onClick={logout} title="Sair">
            <Icon d={ICONS.logout} size={15} width={1.9} />
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
