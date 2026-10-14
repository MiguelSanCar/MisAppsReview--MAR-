import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Me } from '../types';

interface AuthValue {
  user: Me | null;
  loading: boolean;
  setUser: (u: Me | null) => void;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthValue>(null as unknown as AuthValue);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser((await api.get<{ user: Me | null }>('/api/auth/me')).user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<AuthValue>(
    () => ({
      user, loading, setUser, refresh,
      login: async (identifier, password) => setUser((await api.post<{ user: Me }>('/api/auth/login', { identifier, password })).user),
      register: async (username, email, password) => {
        // La cuenta nace con el tema que la persona ya estaba usando en este navegador
        const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        setUser((await api.post<{ user: Me }>('/api/auth/register', { username, email, password, theme })).user);
      },
      logout: async () => { await api.post('/api/auth/logout'); setUser(null); },
    }),
    [user, loading, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
