import { useState } from 'react';
import { errMsg, post } from '../api/client';
import type { Me } from '../api/types';
import { useApp } from '../auth/AppContext';
import { Alert, Field, Modal } from '../components/ui';

const MIN = 8;

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { setSession, toast } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (next.length < MIN) return setErr(`A nova senha precisa ter pelo menos ${MIN} caracteres.`);
    if (next !== confirm) return setErr('A confirmação não confere com a nova senha.');
    setBusy(true);
    setErr(null);
    try {
      const r = await post<{ token: string; user: Me }>('/auth/change-password', { currentPassword: current, newPassword: next });
      // A troca derruba as sessões antigas: grava o token novo antes de qualquer
      // recarga de consulta (por isso não usa useMutate, que invalida antes).
      setSession(r.token, r.user);
      toast('Senha alterada');
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Trocar senha"
      sub="Outras sessões abertas com a senha antiga serão encerradas."
      width={420}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={save}>Salvar nova senha</button></>}
    >
      <Field label="Senha atual"><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus /></Field>
      <Field label="Nova senha" hint={`Mínimo de ${MIN} caracteres.`}><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <Field label="Confirmar nova senha"><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      {err && <Alert>{err}</Alert>}
    </Modal>
  );
}
