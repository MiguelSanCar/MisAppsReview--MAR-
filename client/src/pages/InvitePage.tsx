import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Avatar, ErrorBox, Spinner } from '../components/ui';

interface Mini { username: string; avatarUrl: string | null }
interface Preview { kind: 'befriend' | 'request'; creator: Mini; target: Mini | null }
interface Accepted { result: 'friends' | 'requested' | 'pending' | 'already'; user: Mini & { id: number } }

function Card({ children }: { children: React.ReactNode }) {
  return <div className="auth-card invite-card">{children}</div>;
}

/**
 * Pantalla de un enlace de amistad (/invite/:token).
 * - Con sesión: se aplica solo (amigo directo, o solicitud si el enlace es de otro perfil).
 * - Sin sesión: se pide iniciar sesión o registrarse y se vuelve aquí.
 */
export default function InvitePage() {
  const { token = '' } = useParams();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Accepted | null>(null);
  const [acceptError, setAcceptError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    api.get<Preview>(`/api/invites/${token}`).then(setPreview).catch((e) => setError(errorText(e)));
  }, [token]);

  useEffect(() => {
    if (loading || !user || !preview || started.current) return;
    started.current = true; // una sola vez (StrictMode ejecuta los efectos dos veces en desarrollo)
    api.post<Accepted>(`/api/invites/${token}/accept`).then(setDone).catch((e) => setAcceptError(errorText(e)));
  }, [loading, user, preview, token]);

  if (error) return <Card><h1>Enlace no válido</h1><ErrorBox>{error}</ErrorBox><p className="auth-foot"><Link to="/">Ir al inicio</Link></p></Card>;
  if (!preview || loading) return <Spinner />;

  const { creator, target } = preview;
  const who = target ?? creator;
  const headline = preview.kind === 'befriend'
    ? <><b>{creator.username}</b> te invita a ser su amigo</>
    : <><b>{creator.username}</b> te comparte el perfil de <b>{target?.username}</b>: puedes enviarle una solicitud de amistad</>;

  // Sin sesión
  if (!user) {
    const next = encodeURIComponent(`/invite/${token}`);
    return (
      <Card>
        <div className="invite-who"><Avatar user={who} size={88} /></div>
        <h1 className="invite-title">{headline}</h1>
        <p className="note">Para añadir un amigo necesitas estar registrado o haber iniciado sesión.</p>
        <div className="invite-actions">
          <Link className="btn primary" to={`/login?next=${next}`}>Iniciar sesión</Link>
          <Link className="btn ghost" to={`/register?next=${next}`}>Registrarme</Link>
        </div>
      </Card>
    );
  }

  // Con sesión
  if (acceptError) return <Card><h1 className="invite-title">{headline}</h1><ErrorBox>{acceptError}</ErrorBox><p className="auth-foot"><Link to="/friends">Mis amigos</Link></p></Card>;
  if (!done) return <Spinner text="Procesando el enlace…" />;

  const u = done.user;
  const message = {
    friends: <>¡Ya eres amigo de <b>{u.username}</b>!</>,
    already: <>Ya eres amigo de <b>{u.username}</b>.</>,
    requested: <>Solicitud enviada a <b>{u.username}</b>. Cuando la acepte, seréis amigos.</>,
    pending: <>Ya habías enviado una solicitud a <b>{u.username}</b>; está pendiente de que la acepte.</>,
  }[done.result];

  return (
    <Card>
      <div className="invite-who"><Avatar user={u} size={88} /></div>
      <h1 className="invite-title">{message}</h1>
      <div className="invite-actions">
        {(done.result === 'friends' || done.result === 'already') && <Link className="btn primary" to={`/perfil/${encodeURIComponent(u.username)}`}>Ver su perfil</Link>}
        <Link className="btn ghost" to="/friends">Mis amigos</Link>
      </div>
    </Card>
  );
}
