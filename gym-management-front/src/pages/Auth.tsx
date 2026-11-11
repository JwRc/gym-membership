import { FormEvent, useState } from 'react';
import { errMsg, post } from '../api/client';
import type { Me } from '../api/types';
import { useApp } from '../auth/AppContext';
import { Alert, Field, ICONS, Icon } from '../components/ui';

type Session = { token: string; user: Me };

export function AuthPage() {
  const { setSession, theme, toggleTheme } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const s = await post<Session>('/auth/login', { email, password });
      setSession(s.token, s.user);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  }

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
        <div>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.15, maxWidth: 440 }}>Alunos, turmas, graduação e financeiro em um só lugar.</h2>
          <div style={{ fontSize: 13.5, color: 'var(--mute)', marginTop: 12, lineHeight: 1.55, maxWidth: 420 }}>
            Cadastro de alunos, mensalidades, loja e graduação para a recepção da sua academia.
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--mute3)' }}>v1.0</div>
      </div>

      <div style={{ overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative' }}>
        <button className="icon-btn" onClick={toggleTheme} style={{ position: 'absolute', top: 16, right: 16, border: '1px solid var(--bd2)' }} title="Alternar tema">
          <Icon d={theme === 'dark' ? ICONS.sun : ICONS.moon} size={15} width={1.9} />
        </button>
        <form style={{ width: 420, maxWidth: '100%' }} onSubmit={submit}>
          <h1>Entrar</h1>
          <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6 }}>Use o e-mail cadastrado para a sua academia.</div>
          <div className="col" style={{ gap: 14, marginTop: 24 }}>
            <Field label="E-mail">
              <input className="input input-lg" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
            </Field>
            <div>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="field-l" style={{ margin: 0 }}>Senha</span>
                <span style={{ fontSize: 12, color: 'var(--sub)', cursor: 'pointer' }} onClick={() => setErr('Fale com o suporte do sistema para redefinir sua senha.')}>
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
        </form>
      </div>
    </div>
  );
}
