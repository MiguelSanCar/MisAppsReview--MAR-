import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { useToast } from '../components/Toast';
import { Avatar, ErrorBox, Spinner } from '../components/ui';
import type { PublicUser } from '../types';

interface FriendsData {
  friends: PublicUser[];
  incoming: { id: number; user: PublicUser }[];
  outgoing: { id: number; user: PublicUser }[];
}

export function FriendCard({ user, to }: { user: PublicUser; to?: string | null }) {
  const body = (
    <>
      <Avatar user={user} size={72} />
      <strong>{user.username}</strong>
    </>
  );
  return to === null ? <div className="fcard">{body}</div> : <Link className="fcard" to={to ?? `/perfil/${encodeURIComponent(user.username)}`}>{body}</Link>;
}

export function FriendsPage() {
  const toast = useToast();
  const [data, setData] = useState<FriendsData | null>(null);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');

  const load = useCallback(() => {
    api.get<FriendsData>('/api/friends').then(setData).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ accepted: boolean; user: PublicUser }>('/api/friends/requests', { username });
      toast(r.accepted ? `¡Ahora sois amigos, ${r.user.username}!` : `Solicitud enviada a ${r.user.username}`, 'ok');
      setUsername(''); load();
    } catch (err) { toast(errorText(err)); }
  }
  async function act(fn: () => Promise<unknown>) {
    try { await fn(); load(); } catch (err) { toast(errorText(err)); }
  }

  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  if (!data) return <Spinner />;

  return (
    <div className="page">
      <h1 className="h1">Mis amigos</h1>
      <form className="inline-form" onSubmit={add}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nombre de usuario de tu amigo" aria-label="Nombre de usuario" required />
        <button className="btn primary">Enviar solicitud</button>
      </form>

      {data.incoming.length > 0 && (
        <section>
          <h2 className="h2">Solicitudes recibidas</h2>
          <ul className="rows">
            {data.incoming.map((r) => (
              <li key={r.id}>
                <Avatar user={r.user} size={36} /> <strong>{r.user.username}</strong>
                <span className="spacer" />
                <button className="btn primary" onClick={() => act(() => api.post(`/api/friends/requests/${r.id}/accept`))}>Aceptar</button>
                <button className="btn ghost" onClick={() => act(() => api.del(`/api/friends/requests/${r.id}`))}>Rechazar</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.outgoing.length > 0 && (
        <section>
          <h2 className="h2">Solicitudes enviadas</h2>
          <ul className="rows">
            {data.outgoing.map((r) => (
              <li key={r.id}>
                <Avatar user={r.user} size={36} /> <strong>{r.user.username}</strong> <span className="muted small">pendiente</span>
                <span className="spacer" />
                <button className="btn ghost" onClick={() => act(() => api.del(`/api/friends/requests/${r.id}`))}>Cancelar</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="h2">Amigos <span className="muted">({data.friends.length})</span></h2>
        {data.friends.length ? (
          <div className="fgrid">{data.friends.map((f) => <FriendCard key={f.id} user={f} />)}</div>
        ) : (
          <p className="muted">Aún no tienes amigos. Envía una solicitud con su nombre de usuario.</p>
        )}
      </section>
    </div>
  );
}
