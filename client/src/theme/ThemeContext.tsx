import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import type { Me } from '../types';

export type Theme = 'dark' | 'light';
const KEY = 'mar-theme';
const BAR: Record<Theme, string> = { dark: '#0b0f1a', light: '#f3f5fa' };

/** Pone el tema en el documento, en la barra del navegador y en el almacenamiento local (lo lee theme-init.js). */
export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t]);
  try { localStorage.setItem(KEY, t); } catch { /* sin almacenamiento */ }
}

const current = (): Theme => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

interface ThemeValue { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }
const Ctx = createContext<ThemeValue>({ theme: 'dark', setTheme: () => {}, toggle: () => {} });
export const useTheme = () => useContext(Ctx);

/**
 * El oscuro es el tema por defecto. La elección se recuerda en el navegador (sirve antes de iniciar sesión) y,
 * con sesión, se guarda en la cuenta: al entrar desde otro dispositivo se aplica la preferencia de la cuenta.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [theme, setThemeState] = useState<Theme>(current);

  // Al iniciar sesión (o al recuperar una sesión abierta) manda la preferencia de la cuenta
  useEffect(() => {
    if (user?.theme && user.theme !== current()) {
      applyTheme(user.theme);
      setThemeState(user.theme);
    }
    // solo al cambiar de persona: los cambios posteriores los gestiona setTheme
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    setThemeState(t);
    if (!user) return;
    api.put<{ user: Me }>('/api/me/theme', { theme: t }).then((r) => setUser(r.user)).catch((e) => toast(`No se pudo guardar el tema en tu cuenta: ${errorText(e)}`));
  }, [user, setUser, toast]);

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);
  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}
