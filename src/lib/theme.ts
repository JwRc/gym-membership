import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

function initial(): Theme {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}

/** Cores de avatar derivadas do nome (mesma fórmula do design). */
export function avatarColors(name: string, theme: Theme) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return theme === 'light'
    ? { bg: `hsl(${h} 42% 90%)`, fg: `hsl(${h} 45% 30%)` }
    : { bg: `hsl(${h} 26% 20%)`, fg: `hsl(${h} 62% 80%)` };
}

/** Fundo suave para a cor de uma modalidade. */
export const soft = (hex: string, a = 0.14) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
