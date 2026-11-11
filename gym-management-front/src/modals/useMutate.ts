import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errMsg } from '../api/client';
import { useApp } from '../auth/AppContext';

/** Executa uma escrita, mostra toast e invalida todas as consultas (o servidor também invalida o cache). */
export function useMutate() {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      await qc.invalidateQueries();
      if (ok) toast(typeof ok === 'function' ? ok(r) : ok);
      return r;
    } catch (e) {
      setErr(errMsg(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, err, setErr };
}
