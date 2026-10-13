import { useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Spinner } from '../components/ui';

/** Direcciones antiguas /friend/<número>[/list|/friends] → /perfil/<usuario>[/lista|/amigos]. */
export function LegacyFriendRedirect() {
  const { id } = useParams();
  const loc = useLocation();
  const [to, setTo] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ username: string }>(`/api/profiles/by-id/${encodeURIComponent(id ?? '')}`)
      .then((r) => {
        const rest = loc.pathname.replace(/^\/friend\/\d+/, '');
        const sub = rest.startsWith('/list') ? '/lista' : rest.startsWith('/friends') ? '/amigos' : '';
        setTo(`/perfil/${encodeURIComponent(r.username)}${sub}`);
      })
      .catch((e) => setError(errorText(e)));
  }, [id, loc.pathname]);

  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  return to ? <Navigate to={to} replace /> : <Spinner />;
}

/** Enlaces antiguos /u/<token> → /perfil/<usuario> (solo si el perfil es público). */
export function LegacyShareRedirect() {
  const { token } = useParams();
  const [to, setTo] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ username: string }>(`/api/public/${encodeURIComponent(token ?? '')}`)
      .then((r) => setTo(`/perfil/${encodeURIComponent(r.username)}`))
      .catch((e) => setError(errorText(e)));
  }, [token]);

  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  return to ? <Navigate to={to} replace /> : <Spinner />;
}

/** /profile → mi perfil con su URL propia. */
export function MyProfileRedirect() {
  const { user } = useAuth();
  return user ? <Navigate to={`/perfil/${encodeURIComponent(user.username)}`} replace /> : <Spinner />;
}
