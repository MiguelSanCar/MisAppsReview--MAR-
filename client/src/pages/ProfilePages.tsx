import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import { copyText } from '../clipboard';
import { PosterCard } from '../components/PosterCard';
import { useToast } from '../components/Toast';
import { Avatar, ErrorBox, formatDay, Spinner } from '../components/ui';
import { useProfileCtx } from '../profile/ProfileContext';
import { CompareData, CompareRow, LibraryItem, ProfileData, PublicUser, STATUS_TEXT, STATUSES } from '../types';
import { FriendCard } from './FriendsPages';
import { ListGrid } from './ListViews';

/** Dirección única de un perfil: la misma para todo el mundo. */
export const profileUrl = (username: string) => `${window.location.origin}/perfil/${encodeURIComponent(username)}`;

/** Horas totales vistas, en texto: «1.234 horas vistas» (con un decimal por debajo de 10 h). */
export function hoursText(totalMinutes: number): string {
  const h = Math.max(0, totalMinutes) / 60;
  const n = h < 10 ? Math.round(h * 10) / 10 : Math.round(h);
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} ${n === 1 ? 'hora vista' : 'horas vistas'}`;
}

export function ProfileView({
  profile, own, listEndpoint, canOpen,
}: { profile: ProfileData; own?: boolean; listEndpoint?: string | null; canOpen: boolean }) {
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
          <span className="stat-hours">{hoursText(stats.totalMinutes)}</span>
          <span className="muted small">{stats.episodes} episodios vistos</span>
        </div>
        {STATUSES.map((s) => (
          <div key={s} className={`stat st-${s}`}>
            <span className="muted">{STATUS_TEXT[s]}</span>
            <strong>{stats.byStatus[s]}</strong>
          </div>
        ))}
        <div className="stat">
          <span className="muted">Temporadas vistas</span>
          <strong>{stats.seasonsWatched ?? 0}</strong>
        </div>
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

      {listEndpoint && (
        <section>
          <h2 className="h2">Lista de visualizados</h2>
          <ListGrid endpoint={listEndpoint} readOnly noLinks={!canOpen} />
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

  // Sin sesión no hay menú lateral: si el perfil público muestra su lista, se incluye aquí.
  const inline = state.status === 'ok' && !user && state.data.canSeeList;

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'notfound') return <Missing>Este perfil no existe</Missing>;
  if (state.status === 'error') return <div className="page"><ErrorBox>{state.message}</ErrorBox></div>;
  if (state.status === 'private') return <PrivateProfile username={state.user.username} avatarUrl={state.user.avatarUrl} relation={state.relation} />;
  return <ProfileView profile={state.data} own={state.data.access === 'self'} listEndpoint={inline ? `/api/profiles/${encodeURIComponent(ctx.username)}/library` : null} canOpen={!!user} />;
}

/** /perfil/<usuario>/lista */
export function ProfileListPage() {
  const ctx = useProfileCtx()!;
  const { user } = useAuth();
  return (
    <div className="page">
      <h1 className="h1">Lista de {ctx.username}</h1>
      <ListGrid key={ctx.username + (user?.id ?? '')} endpoint={`/api/profiles/${encodeURIComponent(ctx.username)}/library`} readOnly noLinks={!user} empty="Todavía no ha añadido nada." />
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

/** Una celda de la comparación: verde (▲ más) para quien tiene más, rojo (▼ menos) para quien tiene menos; el empate no se colorea. */
function CompareCell({ row, side }: { row: CompareRow; side: 'me' | 'them' }) {
  const kind = row.winner === 'tie' ? 'tie' : row.winner === side ? 'win' : 'lose';
  const hint = kind === 'win' ? 'más' : kind === 'lose' ? 'menos' : 'igual';
  return (
    <div className={`cmp-cell cmp-${kind} ${side}`} role="cell">
      <span className="cmp-val">{side === 'me' ? row.meText : row.themText}</span>
      <span className="cmp-mark" aria-hidden="true" />
      <span className="sr-only"> ({hint})</span>
    </div>
  );
}

/** /perfil/<usuario>/comparar */
export function ProfileComparePage() {
  const ctx = useProfileCtx()!;
  const { user } = useAuth();
  const [data, setData] = useState<CompareData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    if (!user) return;
    api.get<CompareData>(`/api/profiles/${encodeURIComponent(ctx.username)}/compare`).then(setData).catch((e) => setError(errorText(e)));
  }, [ctx.username, user?.id]);

  if (!user) {
    const next = encodeURIComponent(`/perfil/${ctx.username}/comparar`);
    return (
      <div className="page">
        <h1 className="h1">Comparar con {ctx.username}</h1>
        <p className="note">Para comparar tus estadísticas con las de {ctx.username} necesitas <Link to={`/login?next=${next}`}>iniciar sesión</Link>.</p>
      </div>
    );
  }

  return (
    <div className="page cmp-page">
      <h1 className="h1">Comparar con {ctx.username}</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!data ? !error && <Spinner /> : (
        <>
          <p className="muted cmp-legend">
            <span className="cmp-key cmp-win"><i className="cmp-mark" aria-hidden="true" /> más</span>
            <span className="cmp-key cmp-lose"><i className="cmp-mark" aria-hidden="true" /> menos</span>
            <span className="cmp-key cmp-tie">igual</span>
          </p>
          <div className="cmp" role="table" aria-label={`Comparación de estadísticas entre tú y ${data.them.username}`}>
            <div className="cmp-row cmp-head" role="row">
              <div className="cmp-who" role="columnheader"><Avatar user={data.me} size={56} /><strong>Tú</strong><span className="muted small">{data.summary.me} en cabeza</span></div>
              <div className="cmp-label" role="columnheader"><span className="sr-only">Estadística</span></div>
              <div className="cmp-who" role="columnheader"><Avatar user={data.them} size={56} /><strong>{data.them.username}</strong><span className="muted small">{data.summary.them} en cabeza</span></div>
            </div>
            {data.rows.map((r) => (
              <div className="cmp-row" role="row" key={r.key}>
                <CompareCell row={r} side="me" />
                <div className="cmp-label" role="rowheader">{r.label}</div>
                <CompareCell row={r} side="them" />
              </div>
            ))}
          </div>
          <p className="muted small">Gana la columna con el valor más alto en cada fila; en {data.summary.ties === 1 ? '1 fila hay empate' : `${data.summary.ties} filas hay empate`}.</p>
        </>
      )}
    </div>
  );
}
