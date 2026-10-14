import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import { copyText } from '../clipboard';
import { useProfileCtx } from '../profile/ProfileContext';
import { AvatarDialog } from './AvatarDialog';
import { Emoji } from './Emoji';
import { Logo } from './Logo';
import { useToast } from './Toast';
import { Avatar, Icon } from './ui';

/** Pie con la atribución que exige TMDB. */
export function Footer() {
  return (
    <footer className="footer">
      <span>MAR · Mis Apps Review · v{__APP_VERSION__}</span>
      <span className="tmdb">
        <b className="tmdb-badge">TMDB</b>
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </span>
    </footer>
  );
}

function Item({ to, children, end }: { to: string; children: ReactNode; end?: boolean }) {
  return <NavLink to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>{children}</NavLink>;
}

const top = ({ isActive }: { isActive: boolean }) => `nav-top ${isActive ? 'active' : ''}`;

export default function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const pctx = useProfileCtx(); // solo existe dentro de /perfil/:username
  // Abierto por defecto en escritorio; en móvil es un cajón.
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches);

  useEffect(() => {
    if (!window.matchMedia('(min-width: 900px)').matches) setOpen(false);
  }, [loc.pathname]);

  if (!user) return null;

  // ¿Estoy viendo el perfil de otra persona? Entonces el menú pasa a «Su perfil», «Su lista»…
  const other = !!pctx && pctx.username.toLowerCase() !== user.username.toLowerCase();
  const st = pctx?.state;
  const otherData = other && st?.status === 'ok' ? st.data : null;
  const otherUser = other
    ? st?.status === 'ok' ? st.data.user
      : st?.status === 'private' ? { id: 0, username: st.user.username, avatarUrl: st.user.avatarUrl, memberSince: '' }
      : null
    : null;
  const viewing = other ? otherUser : user;
  const base = other ? `/perfil/${encodeURIComponent(pctx!.username)}` : '';

  /** Copia un enlace ligado a ti: el propio añade como amigo; en el perfil de otra persona, envía una solicitud a esa persona. */
  async function copyInvite() {
    if (!viewing) return;
    try {
      if (other && !otherData) {
        // Perfil privado de un desconocido: solo se puede compartir la URL del perfil
        if (await copyText(`${window.location.origin}/perfil/${encodeURIComponent(viewing.username)}`)) toast('URL del perfil copiada', 'ok');
        return;
      }
      const r = otherData
        ? await api.post<{ token: string }>(`/api/invites/request/${otherData.user.id}`)
        : await api.post<{ token: string }>('/api/invites/mine');
      const ok = await copyText(`${window.location.origin}/invite/${r.token}`);
      if (ok) {
        toast(
          other
            ? `Enlace copiado: quien lo abra enviará una solicitud de amistad a ${viewing.username}`
            : 'Enlace copiado: quien lo abra con su cuenta te añadirá como amigo',
          'ok',
        );
      }
    } catch (e) { toast(errorText(e)); }
  }

  return (
    <div className={`shell ${open ? 'is-open' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open}>
          <Icon name={open ? 'close' : 'menu'} />
        </button>
        <Link to="/home" className="brand" aria-label="MAR, ir al inicio"><Logo height={20} /></Link>
      </header>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className="sidebar" aria-label="Menú lateral">
        <div className="side-profile">
          <button className="avatar-btn" onClick={() => viewing && setAvatarOpen(true)} aria-label="Ver foto de perfil" title={other ? 'Ver foto' : 'Ver o cambiar tu foto'}>
            {viewing ? <Avatar user={viewing} size={84} /> : <span className="avatar avatar-ph" style={{ width: 84, height: 84 }} />}
          </button>
          <button
            className="side-name-btn"
            onClick={copyInvite}
            disabled={!viewing}
            title={other ? (otherData ? 'Copiar enlace para que otras personas le envíen una solicitud' : 'Copiar la URL de este perfil') : 'Copiar tu enlace de amistad'}
          >
            <strong className="side-name">{viewing?.username ?? '…'}</strong> <Icon name="link" />
          </button>
          {other && <span className="muted small">{otherData?.access === 'friend' ? 'Perfil de tu amigo' : 'Perfil de otra persona'}</span>}
        </div>

        {/* Jerarquía: «Inicio» (nivel 0) → «Mi…» (una tabulación) → «Mis listas conjuntas» (otra más); «Ajustes» al nivel de «Inicio» */}
        <nav className="side-nav" aria-label="Navegación">
          <NavLink to="/home" end className={top}>
            <Icon name="home" /> Inicio
          </NavLink>
          <div className="nav-sub">
            {other ? (
              <>
                <Item to={base} end>Su perfil</Item>
                {otherData?.canSeeList && <Item to={`${base}/lista`}>Su lista</Item>}
                {otherData?.canSeeFriends && <Item to={`${base}/amigos`}>Sus amigos</Item>}
                {otherData?.access === 'friend' && <Item to={`${base}/vuestra-lista`}>Vuestra lista</Item>}
              </>
            ) : (
              <>
                <Item to={`/perfil/${encodeURIComponent(user.username)}`} end>Mi perfil</Item>
                <Item to="/list"><Emoji name="notas" className="nav-emoji" />Mi lista</Item>
                <div className="nav-sub">
                  <Item to="/lists"><Emoji name="carpetas" className="nav-emoji" />Mis listas conjuntas</Item>
                </div>
                <Item to="/friends"><Emoji name="amigos" className="nav-emoji" />Mis amigos</Item>
              </>
            )}
          </div>
          {!other && (
            <NavLink to="/settings" className={top}>
              <Icon name="gear" /> Ajustes
            </NavLink>
          )}
        </nav>

        <div className="side-foot">
          <Link to="/roadmap" className="muted small">Roadmap</Link>
          {!other && (
            <button className="btn ghost" onClick={async () => { await logout(); nav('/'); }}>Cerrar sesión</button>
          )}
        </div>
      </aside>

      {avatarOpen && viewing && <AvatarDialog user={viewing} canEdit={!other} onClose={() => setAvatarOpen(false)} />}

      <div className="main">
        <main className="content"><Outlet /></main>
        <Footer />
      </div>
    </div>
  );
}
