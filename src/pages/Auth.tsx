import { FormEvent, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { errMsg, get, post } from '../api/client';
import type { Me } from '../api/types';
import { useApp } from '../auth/AppContext';
import { Alert, Avatar, Field, ICONS, Icon, Seg } from '../components/ui';
import { soft } from '../lib/theme';

const DEMOS = [
  { name: 'Ricardo Almeida', role: 'Administrador', ten: 'Academia Tatame', email: 'ricardo@academiatatame.com.br', pw: 'tatame123' },
  { name: 'João Victor Santos', role: 'Aluno', ten: 'Academia Tatame', email: 'joao.santos@gmail.com', pw: 'aluno123' },
  { name: 'Helena Kato', role: 'Administradora', ten: 'CT Kaizen · academia nova', email: 'helena@ctkaizen.com.br', pw: 'kaizen123' },
];
const SHOW_DEMOS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMOS === 'true';

type Session = { token: string; user: Me };

export function AuthPage() {
  const { setSession, theme, toggleTheme } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [kind, setKind] = useState<'academy' | 'student'>('academy');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [academy, setAcademy] = useState('');
  const [code, setCode] = useState('');
  const [mods, setMods] = useState<string[]>(['bjj', 'mt', 'box']);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeInfo, setCodeInfo] = useState<{ ok: boolean; msg: string } | null>(null);

  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => get<{ id: string; name: string; color: string }[]>('/auth/catalog'), enabled: mode === 'register' });

  useEffect(() => {
    if (kind !== 'student' || code.trim().length < 6) return setCodeInfo(null);
    const t = setTimeout(() => {
      get<{ name: string }>(`/auth/tenants/${encodeURIComponent(code.trim())}`)
        .then((r) => setCodeInfo({ ok: true, msg: `Academia: ${r.name}` }))
        .catch(() => setCodeInfo({ ok: false, msg: 'Código não encontrado.' }));
    }, 350);
    return () => clearTimeout(t);
  }, [code, kind]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      let s: Session;
      if (mode === 'login') s = await post<Session>('/auth/login', { email, password });
      else if (kind === 'academy') s = await post<Session>('/auth/register/academy', { academyName: academy, name, email, password, disciplines: mods });
      else s = await post<Session>('/auth/register/student', { code, name, email, password });
      setSession(s.token, s.user);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  }

  const go = (m: 'login' | 'register') => {
    setMode(m);
    setErr(null);
  };

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: 'minmax(460px,5fr) minmax(0,7fr)' }}>
      <div style={{ background: 'var(--sunk)', borderRight: '1px solid var(--line3)', padding: '36px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 32, overflow: 'auto' }}>
        <div className="row gap10">
          <div className="logo">
            <Icon d={ICONS.grad} size={18} stroke="#fff" width={1.9} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Gestão de Academias</div>
            <div style={{ fontSize: 11, color: 'var(--mute2)', marginTop: 1 }}>Artes marciais e esportes de luta</div>
          </div>
        </div>
        <div className="col" style={{ gap: 28 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.15, maxWidth: 440 }}>Alunos, turmas, graduação e financeiro em um só lugar.</h2>
            <div style={{ fontSize: 13.5, color: 'var(--mute)', marginTop: 12, lineHeight: 1.55, maxWidth: 420 }}>
              Cada academia tem seu próprio espaço, com dados separados. Os alunos entram para acompanhar graduação, turmas e mensalidades.
            </div>
          </div>
          {SHOW_DEMOS && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="row between" style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 600 }}>
                Contas de demonstração<span style={{ fontWeight: 400, color: 'var(--mute2)' }}>Clique para preencher</span>
              </div>
              {DEMOS.map((d) => (
                <div
                  key={d.email}
                  className="row gap12 trow click"
                  style={{ display: 'flex', minHeight: 50, padding: '10px 16px', borderTop: '1px solid var(--line2)', borderBottom: 'none' }}
                  onClick={() => {
                    go('login');
                    setEmail(d.email);
                    setPassword(d.pw);
                  }}
                >
                  <Avatar name={d.name} />
                  <div className="grow">
                    <div className="ellipsis" style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
                    <div className="ellipsis" style={{ fontSize: 12, color: 'var(--mute)', marginTop: 1 }}>{d.role} · {d.ten}</div>
                  </div>
                  <span className="mono ellipsis" style={{ fontSize: 11, color: 'var(--mute2)', maxWidth: 210 }}>{d.email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--mute3)' }}>v0.1</div>
      </div>

      <div style={{ overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative' }}>
        <button className="icon-btn" onClick={toggleTheme} style={{ position: 'absolute', top: 16, right: 16, border: '1px solid var(--bd2)' }} title="Alternar tema">
          <Icon d={theme === 'dark' ? ICONS.sun : ICONS.moon} size={15} width={1.9} />
        </button>
        <form style={{ width: 420, maxWidth: '100%' }} onSubmit={submit}>
          {mode === 'login' ? (
            <>
              <h1>Entrar</h1>
              <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6 }}>Use o e-mail cadastrado na sua academia.</div>
              <div className="col" style={{ gap: 14, marginTop: 24 }}>
                <Field label="E-mail">
                  <input className="input input-lg" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                </Field>
                <div>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span className="field-l" style={{ margin: 0 }}>Senha</span>
                    <span style={{ fontSize: 12, color: 'var(--sub)', cursor: 'pointer' }} onClick={() => setErr('Peça para a recepção da academia redefinir sua senha.')}>
                      Esqueci a senha
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input className="input input-lg" style={{ paddingRight: 72 }} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" />
                    <span onClick={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: 0, height: 40, display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--mute)', cursor: 'pointer', userSelect: 'none' }}>
                      {show ? 'Ocultar' : 'Mostrar'}
                    </span>
                  </div>
                </div>
                {err && <Alert>{err}</Alert>}
                <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
              </div>
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--mute)', display: 'flex', gap: 6, justifyContent: 'center' }}>
                Ainda não tem acesso?<span style={{ color: 'var(--text)', fontWeight: 500, cursor: 'pointer' }} onClick={() => go('register')}>Criar conta</span>
              </div>
            </>
          ) : (
            <>
              <h1>Criar conta</h1>
              <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6 }}>Cadastre sua academia ou crie seu acesso de aluno.</div>
              <div style={{ marginTop: 22 }}>
                <Seg large value={kind} onChange={(v) => { setKind(v); setErr(null); }} options={[{ v: 'academy', label: 'Sou academia' }, { v: 'student', label: 'Sou aluno' }]} />
              </div>
              <div className="col" style={{ gap: 14, marginTop: 18 }}>
                {kind === 'academy' ? (
                  <>
                    <Field label="Nome da academia"><input className="input input-lg" value={academy} onChange={(e) => setAcademy(e.target.value)} placeholder="Ex.: CT Kaizen" /></Field>
                    <div className="grid2" style={{ gap: 12 }}>
                      <Field label="Seu nome"><input className="input input-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></Field>
                      <Field label="E-mail"><input className="input input-lg" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@academia.com.br" /></Field>
                    </div>
                    <Field label="Senha"><input className="input input-lg" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" /></Field>
                    <Field label="Modalidades" hint="Começam iguais ao catálogo padrão. Dá para personalizar depois, e as mudanças valem só para a sua academia.">
                      <div className="row wrap gap6">
                        {(catalog.data ?? []).map((c) => {
                          const on = mods.includes(c.id);
                          return (
                            <div key={c.id} className={'chip' + (on ? ' on' : '')} style={on ? { borderColor: c.color, background: soft(c.color) } : undefined} onClick={() => setMods(on ? mods.filter((x) => x !== c.id) : [...mods, c.id])}>
                              <span className="sq" style={{ width: 7, height: 7, background: c.color }} />
                              {c.name}
                            </div>
                          );
                        })}
                      </div>
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Código da academia" hint={codeInfo && <span style={{ color: codeInfo.ok ? 'var(--ok)' : 'var(--bad)' }}>{codeInfo.msg}</span>}>
                      <input className="input input-lg mono" style={{ letterSpacing: '0.04em' }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex.: TATAME-4821" />
                    </Field>
                    <Field label="Nome completo"><input className="input input-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como está na matrícula" /></Field>
                    <Field label="E-mail da matrícula"><input className="input input-lg" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="O mesmo que a recepção cadastrou" /></Field>
                    <Field label="Senha"><input className="input input-lg" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" /></Field>
                  </>
                )}
                {err && <Alert>{err}</Alert>}
                <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Criando…' : kind === 'academy' ? 'Criar academia' : 'Criar meu acesso'}</button>
              </div>
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--mute)', display: 'flex', gap: 6, justifyContent: 'center' }}>
                Já tem conta?<span style={{ color: 'var(--text)', fontWeight: 500, cursor: 'pointer' }} onClick={() => go('login')}>Entrar</span>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
