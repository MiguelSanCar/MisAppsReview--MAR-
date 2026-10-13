import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import { copyText } from '../clipboard';
import { PosterCard } from '../components/PosterCard';
import { useToast } from '../components/Toast';
import { Avatar, ErrorBox, formatDay, Spinner } from '../components/ui';
import { useProfileCtx } from '../profile/ProfileContext';
import { LibraryItem, ProfileData, PublicUser, STATUS_TEXT, STATUSES } from '../types';
import { FriendCard } from './FriendsPages';
import { ListGrid } from './ListViews';

/** Dirección única de un perfil: la misma para todo el mundo. */
export const profileUrl = (username: string) => `${window.location.origin}/perfil/${encodeURIComponent(username)}`;

export function ProfileView({
  profile, own, items, canOpen,
}: { profile: ProfileData; own?: boolean; items?: LibraryItem[] | null; canOpen: boolean }) {
  const { user, stats, favorites } = profile;
  const toast = useToast();

  async function copyUrl() {
    if (await copyText(profileUrl(user.username))) toast('URL del perfil copiada', 'ok');
  }

  return (
    <div className="page profile">
      <header className="profile-head">
        <Avatar user={user} size={120} />
        <div>
          <h1 className="h1">{user.username}</h1>
          <p className="muted">
            Se unió en {formatDay(user.memberSince)}
            {own && <> · <span className={`vis-badge ${profile.isPublic ? 'pub' : ''}`}>{profile.isPublic ? 'Perfil público' : 'Solo amigos'}</span></>}
          </p>
          <div className="row">
            <button className="btn ghost" onClick={copyUrl} title={profileUrl(user.username)}>Copiar URL del perfil</button>
            {own && <Link to="/settings" className="small">Cambiar foto y visibilidad</Link>}
          </div>
          {own && !profile.isPublic && <p className="muted small">Tu perfil es privado: solo tus amigos pueden abrir esta URL.</p>}
        </div>
      </header>

      <section className="stats">
        <div className="stat big">
          <span className="muted">Tiempo visto</span>
          <strong>{stats.watchTime.text}</strong>
          <span className="muted small">{stats.episodes} episodios vistos</span>
        </div>
        {STATUSES.map((s) => (
          <div key={s} className={`stat st-${s}`}>
            <span className="muted">{STATUS_TEXT[s]}</span>
            <strong>{stats.byStatus[s]}</strong>
          </div>
        ))}
        <div className="stat">
          <span className="muted">Terminadas</span>
          <ul className="mini-list">
            <li><b>{stats.finishedByType.serie}</b> series</li>
            <li><b>{stats.finishedByType.pelicula}</b> películas</li>
            <li><b>{stats.finishedByType.anime}</b> anime</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="h2">Favoritas <span className="muted">({favorites.length}/10)</span></h2>
        {favorites.length ? (
          <div className="grid">
            {favorites.map((c, i) => (
              <div key={c.id} className="ranked">
                <span className="rank">{i + 1}</span>
                <PosterCard content={c} readOnly to={canOpen ? undefined : null} />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{own ? 'Pulsa ♥ en cualquier título para añadirlo aquí (máximo 10).' : 'Aún no tiene favoritas.'}</p>
        )}
      </section>

      {items && (
        <section>
          <h2 className="h2">Lista de visualizados</h2>
          <ListGrid items={items} readOnly noLinks={!canOpen} />
        </section>
      )}
    </div>
  );
}

/** Perfil privado visto por alguien que no es amigo: solo se sabe que existe. */
function PrivateProfile({ username, avatarUrl, relation }: { username: string; avatarUrl: string | null; relation: string }) {
  const toast = useToast();
  const ctx = useProfileCtx()!;
  const next = encodeURIComponent(`/perfil/${username}`);

  async function send() {
    try {
      const r = await api.post<{ accepted: boolean }>('/api/friends/requests', { username });
      toast(r.accepted ? `¡Ahora sois amigos!` : `Solicitud enviada a ${username}`, 'ok');
      ctx.reload();
    } catch (e) { toast(errorText(e)); }
  }

  async function accept() {
    try {
      const f = await api.get<{ incoming: { id: number; user: PublicUser }[] }>('/api/friends');
      const req = f.incoming.find((r) => r.user.username.toLowerCase() === username.toLowerCase());
      if (!req) throw new Error('No se encontró la solicitud');
      await api.post(`/api/friends/requests/${req.id}/accept`);
      toast('Solicitud aceptada', 'ok');
      ctx.reload();
    } catch (e) { toast(errorText(e)); }
  }

  return (
    <div className="page">
      <div className="auth-card invite-card">
        <div className="invite-who"><Avatar user={{ username, avatarUrl }} size={96} /></div>
        <h1 className="invite-title">{username}</h1>
        <p className="note">Este perfil es privado. Solo sus amigos pueden verlo.</p>
        <div className="invite-actions">
          {relation === 'anonymous' && (
            <>
              <Link className="btn primary" to={`/login?next=${next}`}>Iniciar sesión</Link>
              <Link className="btn ghost" to={`/register?next=${next}`}>Registrarme</Link>
            </>
          )}
          {relation === 'none' && <button className="btn primary" onClick={send}>Enviar solicitud de amistad</button>}
          {relation === 'pending_out' && <button className="btn ghost" disabled>Solicitud enviada · pendiente</button>}
          {relation === 'pending_in' && <button className="btn primary" onClick={accept}>{username} te envió una solicitud: aceptar</button>}
        </div>
        {relation === 'anonymous' && <p className="muted small">Para enviar una solicitud de amistad necesitas estar registrado o haber iniciado sesión.</p>}
      </div>
    </div>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <div className="page"><div className="auth-card invite-card"><h1 className="invite-title">{children}</h1><p className="auth-foot"><Link to="/">Ir al inicio</Link></p></div></div>;
}

/** /perfil/<usuario> */
export function ProfileHomePage() {
  const ctx = useProfileCtx()!;
  const { user } = useAuth();
  const { state } = ctx;
  const [items, setItems] = useState<LibraryItem[] | null>(null);

  // Sin sesión no hay menú lateral: si el perfil público muestra su lista, se incluye aquí.
  const inline = state.status === 'ok' && !user && state.data.canSeeList;
  useEffect(() => {
    setItems(null);
    if (inline) api.get<{ items: LibraryItem[] }>(`/api/profiles/${encodeURIComponent(ctx.username)}/library`).then((r) => setItems(r.items)).catch(() => {});
  }, [inline, ctx.username]);

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'notfound') return <Missing>Este perfil no existe</Missing>;
  if (state.status === 'error') return <div className="page"><ErrorBox>{state.message}</ErrorBox></div>;
  if (state.status === 'private') return <PrivateProfile username={state.user.username} avatarUrl={state.user.avatarUrl} relation={state.relation} />;
  return <ProfileView profile={state.data} own={state.data.access === 'self'} items={inline ? items : null} canOpen={!!user} />;
}

/** /perfil/<usuario>/lista */
export function ProfileListPage() {
  const ctx = useProfileCtx()!;
  const { user } = useAuth();
  const [data, setData] = useState<{ user: PublicUser; items: LibraryItem[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    api.get<{ user: PublicUser; items: LibraryItem[] }>(`/api/profiles/${encodeURIComponent(ctx.username)}/library`)
      .then(setData).catch((e) => setError(errorText(e)));
  }, [ctx.username, user?.id]);

  return (
    <div className="page">
      <h1 className="h1">Lista de {data?.user.username ?? ctx.username}</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      {data ? <ListGrid items={data.items} readOnly noLinks={!user} empty="Todavía no ha añadido nada." /> : !error && <Spinner />}
    </div>
  );
}

/** /perfil/<usuario>/amigos */
export function ProfileFriendsPage() {
  const ctx = useProfileCtx()!;
  const [data, setData] = useState<{ user: PublicUser; friends: PublicUser[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    api.get<{ user: PublicUser; friends: PublicUser[] }>(`/api/profiles/${encodeURIComponent(ctx.username)}/friends`)
      .then(setData).catch((e) => setError(errorText(e)));
  }, [ctx.username]);

  return (
    <div className="page">
      <h1 className="h1">Amigos de {data?.user.username ?? ctx.username}</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      {data ? (
        data.friends.length ? (
          <div className="fgrid">{data.friends.map((f) => <FriendCard key={f.id} user={f} />)}</div>
        ) : (
          <p className="muted">Todavía no tiene amigos.</p>
        )
      ) : !error && <Spinner />}
      <p className="muted small hint-below">Los perfiles privados solo los ven sus amigos.</p>
    </div>
  );
}
