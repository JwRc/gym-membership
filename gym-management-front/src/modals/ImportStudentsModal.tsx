import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errMsg, getBlob, upload } from '../api/client';
import { useApp } from '../auth/AppContext';
import { Alert, Modal } from '../components/ui';
import { brl, saveBlob } from '../lib/format';

interface Analysis {
  total: number;
  valid: number;
  errors: { row: number | null; column: string | null; message: string }[];
  preview: { row: number; name: string; email: string; birthDate: string; monthlyFee: number; dueDay: number }[];
}

/**
 * Importação de alunos por planilha: baixar modelo → enviar → análise.
 * Só importa quando não há nenhum erro; se houver, a pessoa corrige e reenvia.
 */
export function ImportStudentsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<null | 'template' | 'analyze' | 'import'>(null);
  const [err, setErr] = useState<string | null>(null);

  const downloadTemplate = async () => {
    setBusy('template');
    setErr(null);
    try {
      saveBlob(await getBlob('/students/import/template'), 'modelo-importacao-alunos.xlsx');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setAnalysis(null);
    setErr(null);
    setBusy('analyze');
    try {
      setAnalysis(await upload<Analysis>('/students/import/analyze', f));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = ''; // permite reenviar o mesmo arquivo corrigido
    }
  };

  const doImport = async () => {
    if (!file) return;
    setBusy('import');
    setErr(null);
    try {
      const r = await upload<{ created: number }>('/students/import', file);
      await qc.invalidateQueries();
      toast(`${r.created} aluno(s) importado(s)`);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const ready = !!analysis && analysis.errors.length === 0 && analysis.valid > 0;
  const fileErrors = analysis?.errors.filter((e) => e.row === null) ?? [];
  const rowErrors = analysis?.errors.filter((e) => e.row !== null) ?? [];
  const badRows = new Set(rowErrors.map((e) => e.row)).size;

  return (
    <Modal
      title="Importar alunos"
      sub="Planilha .xlsx ou .csv · só cadastro (não gera mensalidades)"
      width={720}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{ready ? 'Cancelar' : 'Fechar'}</button>
          {ready && (
            <button className="btn btn-primary" disabled={!!busy} onClick={doImport}>
              {busy === 'import' ? 'Importando…' : `Importar ${analysis!.valid} aluno(s)`}
            </button>
          )}
        </>
      }
    >
      <div className="row gap12" style={{ alignItems: 'stretch' }}>
        <div className="card grow" style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>1. Baixe o modelo</div>
          <div style={{ fontSize: 12.5, color: 'var(--mute)', margin: '4px 0 10px', lineHeight: 1.5 }}>Já vem com os planos e dias de vencimento da academia e uma aba de instruções.</div>
          <button className="btn btn-sm" disabled={!!busy} onClick={downloadTemplate}>{busy === 'template' ? 'Gerando…' : 'Baixar modelo (.xlsx)'}</button>
        </div>
        <div className="card grow" style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>2. Envie a planilha preenchida</div>
          <div style={{ fontSize: 12.5, color: 'var(--mute)', margin: '4px 0 10px', lineHeight: 1.5 }}>O sistema confere todas as linhas antes de gravar.</div>
          <input ref={input} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
          <button className="btn btn-sm" disabled={!!busy} onClick={() => input.current?.click()}>
            {busy === 'analyze' ? 'Analisando…' : analysis && !ready ? 'Enviar arquivo corrigido' : 'Escolher arquivo'}
          </button>
          {file && <span className="ellipsis" style={{ fontSize: 12, color: 'var(--mute2)', marginLeft: 10 }}>{file.name}</span>}
        </div>
      </div>

      {analysis && ready && (
        <>
          <Alert warn>
            Tudo certo: {analysis.valid} aluno(s) prontos para importar. Confira os primeiros abaixo e confirme.
          </Alert>
          <div className="card" style={{ overflow: 'hidden' }}>
            {analysis.preview.map((p) => (
              <div key={p.row} className="row gap12" style={{ padding: '8px 14px', borderTop: '1px solid var(--line2)', fontSize: 12.5 }}>
                <span className="mono" style={{ color: 'var(--mute2)', width: 52 }}>linha {p.row}</span>
                <span className="grow ellipsis" style={{ fontWeight: 500 }}>{p.name}</span>
                <span className="ellipsis" style={{ color: 'var(--mute)', maxWidth: 200 }}>{p.email}</span>
                <span className="num">{brl(p.monthlyFee)}</span>
                <span style={{ color: 'var(--mute)' }}>dia {String(p.dueDay).padStart(2, '0')}</span>
              </div>
            ))}
            {analysis.valid > analysis.preview.length && (
              <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line2)', fontSize: 12, color: 'var(--mute2)' }}>
                e mais {analysis.valid - analysis.preview.length} aluno(s)
              </div>
            )}
          </div>
        </>
      )}

      {analysis && !ready && (
        <>
          <Alert>
            {fileErrors.length
              ? 'Não foi possível ler a planilha. Corrija e envie de novo.'
              : `${badRows} de ${analysis.total} linha(s) com erro. Nada foi importado: corrija a planilha e envie o arquivo de novo.`}
          </Alert>
          <div className="card" style={{ maxHeight: 300, overflow: 'auto' }}>
            <div className="thead" style={{ gridTemplateColumns: '70px 170px minmax(0,1fr)', position: 'sticky', top: 0 }}>
              <div>Linha</div><div>Coluna</div><div>Problema</div>
            </div>
            {analysis.errors.map((e, i) => (
              <div key={i} className="trow" style={{ gridTemplateColumns: '70px 170px minmax(0,1fr)', minHeight: 38, fontSize: 12.5 }}>
                <div className="mono">{e.row ?? '—'}</div>
                <div className="ellipsis" style={{ color: 'var(--mute)' }}>{e.column ?? '—'}</div>
                <div style={{ lineHeight: 1.4 }}>{e.message}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {err && <Alert>{err}</Alert>}
    </Modal>
  );
}
