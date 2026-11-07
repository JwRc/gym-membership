import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { get, setOnUnauthorized, tokenStore } from '../api/client';
import type { Me } from '../api/types';
import { Theme, useTheme } from '../lib/theme';

interface Ctx {
  me: Me | null;
  booting: boolean;
  setSession: (token: string, me: Me) => void;
  logout: () => void;
  theme: Theme;
  toggleTheme: () => void;
  toast: (msg: string, error?: boolean) => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(!!tokenStore.get());
  const { theme, toggle } = useTheme();
  const [toastState, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const timer = useRef<number>(undefined);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setMe(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setOnUnauthorized(logout);
    if (!tokenStore.get()) return;
    get<Me>('/auth/me')
      .then(setMe)
      .catch(() => tokenStore.set(null))
      .finally(() => setBooting(false));
  }, [logout]);

  const toast = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      me,
      booting,
      setSession: (token, m) => {
        tokenStore.set(token);
        qc.clear();
        setMe(m);
      },
      logout,
      theme,
      toggleTheme: toggle,
      toast,
    }),
    [me, booting, logout, theme, toggle, toast, qc],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
      {toastState && (
        <div className={'toast' + (toastState.error ? ' err' : '')} role="status">
          <span className="dot" style={{ background: toastState.error ? 'var(--bad)' : 'var(--ok)', width: 8, height: 8 }} />
          {toastState.msg}
        </div>
      )}
    </AppCtx.Provider>
  );
}
