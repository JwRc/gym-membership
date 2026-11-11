import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api/client';
import { Alert, Field, Modal } from '../components/ui';
import { useMutate } from './useMutate';

/** LGPD: confirmação para apagar os dados pessoais de um aluno. */
export function AnonymizeModal({ student, onClose }: { student: { id: string; name: string }; onClose: () => void }) {
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const m = useMutate();
  const ok = typed.trim().toLowerCase() === student.name.trim().toLowerCase();

  const confirm = async () => {
    const r = await m.run(() => post<{ openInvoicesRemoved: number }>(`/students/${student.id}/anonymize`), 'Dados pessoais removidos');
    if (r) {
      onClose();
      nav('/alunos');
    }
  };

  return (
    <Modal
      title="Remover dados pessoais"
      sub={student.name}
      width={480}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-danger" disabled={!ok || m.busy} onClick={confirm}>Remover dados</button></>}
    >
      <Alert warn>
        Use quando o aluno (ou responsável) pedir a exclusão dos dados, conforme a LGPD. <b>Não dá para desfazer.</b> Se quiser guardar uma cópia, use antes "Exportar dados".
      </Alert>
      <div style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
        Nome, contatos, nascimento, observações médicas e responsável são apagados, e o aluno sai das turmas e das listas.
        Mensalidades pagas e compras continuam no financeiro, sem identificação. Mensalidades em aberto são excluídas.
      </div>
      <Field label={`Para confirmar, digite o nome do aluno: ${student.name}`}>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      </Field>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
