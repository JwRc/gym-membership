import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { errMsg, get, post } from '../../api/client';
import type { InvoiceRow, StudentInvoices } from '../../api/types';
import { useApp } from '../../auth/AppContext';
import { Alert, ErrorBox, Loading, Modal } from '../../components/ui';
import { InvoicesTable, InvoiceStats } from '../../components/InvoiceBlocks';
import { brl } from '../../lib/format';

export function PortalInvoicesPage() {
  const { toast } = useApp();
  const q = useQuery({ queryKey: ['me-invoices'], queryFn: () => get<StudentInvoices>('/me/invoices') });
  const [pix, setPix] = useState<{ inv: InvoiceRow; code: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const inv = q.data!;
  const pay = async (r: InvoiceRow) => {
    setErr(null);
    try {
      const res = await post<{ copyPaste: string }>(`/me/invoices/${r.id}/pix`);
      setPix({ inv: r, code: res.copyPaste });
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <div className="page">
      <div><h1>Mensalidades</h1><div className="page-sub">{brl(inv.summary.monthlyFee)}/mês · vence todo dia {String(inv.summary.dueDay).padStart(2, '0')}</div></div>
      {err && <Alert>{err}</Alert>}
      <InvoiceStats inv={inv} />
      <InvoicesTable inv={inv} action="Pagar com Pix" onPay={pay} />
      {pix && (
        <Modal title="Pagar com Pix" sub={`${pix.inv.ref} · ${brl(pix.inv.amount)}`} width={460} onClose={() => setPix(null)}
          footer={<><button className="btn" onClick={() => setPix(null)}>Fechar</button><button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(pix.code).catch(() => undefined); toast('Código Pix copiado'); }}>Copiar código</button></>}>
          <div style={{ fontSize: 13, color: 'var(--mute)' }}>Copie o código abaixo e cole no app do seu banco, em Pix › Copia e cola. A baixa aparece assim que a academia confirmar.</div>
          <div className="mono" style={{ fontSize: 11.5, wordBreak: 'break-all', padding: 12, borderRadius: 8, background: 'var(--sunk)', border: '1px solid var(--bd2)' }}>{pix.code}</div>
          <Alert warn>Ambiente de demonstração: o código Pix é fictício.</Alert>
        </Modal>
      )}
    </div>
  );
}
