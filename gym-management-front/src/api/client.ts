import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'gm.token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* armazenamento indisponível: sessão só em memória */
    }
  },
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });

api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let onUnauthorized: (() => void) | null = null;
export const setOnUnauthorized = (fn: () => void) => (onUnauthorized = fn);

api.interceptors.response.use(
  (r) => r,
  (e: AxiosError) => {
    if (e.response?.status === 401 && !e.config?.url?.startsWith('/auth/')) onUnauthorized?.();
    return Promise.reject(e);
  },
);

/** Mensagem amigável a partir do erro da API. */
export function errMsg(e: unknown): string {
  const ax = e as AxiosError<{ message?: string | string[] }>;
  const m = ax?.response?.data?.message;
  if (Array.isArray(m)) return m[0];
  if (m) return m;
  if (ax?.code === 'ERR_NETWORK') return 'Não foi possível conectar ao servidor.';
  return 'Algo deu errado. Tente novamente.';
}

export const get = <T,>(url: string, params?: Record<string, unknown>) => api.get<T>(url, { params }).then((r) => r.data);
export const post = <T,>(url: string, body?: unknown) => api.post<T>(url, body).then((r) => r.data);
export const patch = <T,>(url: string, body?: unknown) => api.patch<T>(url, body).then((r) => r.data);
export const del = <T,>(url: string) => api.delete<T>(url).then((r) => r.data);

/** Envia um arquivo (multipart, campo "file"). */
export const upload = <T,>(url: string, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post<T>(url, fd).then((r) => r.data);
};

/** Baixa um arquivo autenticado como Blob. */
export const getBlob = (url: string) => api.get<Blob>(url, { responseType: 'blob' }).then((r) => r.data);
