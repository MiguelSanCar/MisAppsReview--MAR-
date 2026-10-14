import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Footer } from '../components/Layout';
import { Logo } from '../components/Logo';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { ErrorBox, Field, PasswordInput } from '../components/ui';

/** Destino tras iniciar sesión: solo rutas internas (evita redirecciones a otros sitios). */
function useNext() {
  const [sp] = useSearchParams();
  const raw = sp.get('next') ?? '';
  const ok = /^\/(?!\/)[\w\-./?=&%]*$/.test(raw);
  return { to: ok ? raw : '/home', suffix: ok ? `?next=${encodeURIComponent(raw)}` : '' };
}

/** Cabecera pública: arriba a la derecha "Iniciar sesión" y "Registrarse". */
export function PublicLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Pantallas de acceso: en el móvil ocupan justo la altura de la ventana, sin desplazamiento vertical.
  const fit = ['/', '/login', '/register', '/forgot'].includes(pathname) || pathname.startsWith('/reset/') || pathname.startsWith('/verify/');
  return (
    <div className={`public ${fit ? 'fit' : ''}`}>
      <header className="pub-top">
        <Link to="/" className="brand" aria-label="MAR, ir al inicio"><Logo height={20} /></Link>
        <nav className="pub-nav">
          <Link to="/roadmap" className="muted">Roadmap</Link>
          {user ? (
            <Link className="btn primary" to="/home">Ir a la app</Link>
          ) : (
            <>
              <Link className="btn ghost" to="/login">Iniciar sesión</Link>
              <Link className="btn primary" to="/register">Registrarse</Link>
            </>
          )}
          <ThemeSwitch />
        </nav>
      </header>
      <div className="pub-body"><Outlet /></div>
      <Footer />
    </div>
  );
}

export function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/home" replace />;
  return (
    <section className="hero">
      <h1>Tu registro personal de series, películas y anime</h1>
      <p>Busca, marca lo que has visto y lo que quieres ver, y comparte tus estadísticas. Sin distracciones.</p>
      <div className="hero-actions">
        <Link className="btn primary lg" to="/register">Crear cuenta</Link>
        <Link className="btn ghost lg" to="/login">Ya tengo cuenta</Link>
      </div>
    </section>
  );
}

function AuthCard({ title, children, foot }: { title: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="auth-card">
      <h1>{title}</h1>
      {children}
      {foot && <p className="auth-foot">{foot}</p>}
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(identifier, password); nav(next.to); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <AuthCard title="Iniciar sesión" foot={<>¿No tienes cuenta? <Link to={`/register${next.suffix}`}>Regístrate</Link></>}>
      <form onSubmit={submit} className="form">
        <Field id="identifier" label="Usuario o correo" value={identifier} onChange={setIdentifier} autoComplete="username" />
        <PasswordInput value={password} onChange={setPassword} />
        {error && <ErrorBox>{error}</ErrorBox>}
        <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <Link to="/forgot" className="muted small">He olvidado mi contraseña</Link>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await register(username, email, password); nav(next.to); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <AuthCard title="Crear cuenta" foot={<>¿Ya tienes cuenta? <Link to={`/login${next.suffix}`}>Inicia sesión</Link></>}>
      <form onSubmit={submit} className="form">
        <Field id="username" label="Nombre de usuario" value={username} onChange={setUsername} autoComplete="username" />
        <Field id="email" type="email" label="Correo" value={email} onChange={setEmail} autoComplete="email" />
        <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        <span className="muted small">Mínimo 8 caracteres.</span>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button className="btn primary" disabled={busy}>{busy ? 'Creando…' : 'Registrarme'}</button>
      </form>
    </AuthCard>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | undefined>();
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post<{ devLink?: string }>('/api/auth/forgot', { email });
      setDevLink(r.devLink); setSent(true);
    } catch (err) { setError(errorText(err)); }
  }

  return (
    <AuthCard title="Recuperar contraseña" foot={<Link to="/login">Volver a iniciar sesión</Link>}>
      {sent ? (
        <div className="form">
          <p>Si el correo está registrado, recibirás un enlace para elegir una contraseña nueva.</p>
          {devLink && (
            <p className="note">
              <b>Modo local (sin servidor de correo):</b> usa este enlace.<br />
              <Link to={devLink.replace(/^https?:\/\/[^/]+/, '')}>{devLink}</Link>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="form">
          <Field id="email" type="email" label="Correo de tu cuenta" value={email} onChange={setEmail} autoComplete="email" />
          {error && <ErrorBox>{error}</ErrorBox>}
          <button className="btn primary">Enviar enlace</button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPage() {
  const { token = '' } = useParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try { await api.post('/api/auth/reset', { token, password }); setDone(true); } catch (err) { setError(errorText(err)); }
  }

  return (
    <AuthCard title="Nueva contraseña">
      {done ? (
        <p>Contraseña cambiada. <Link to="/login">Inicia sesión</Link></p>
      ) : (
        <form onSubmit={submit} className="form">
          <PasswordInput value={password} onChange={setPassword} label="Nueva contraseña" autoComplete="new-password" />
          {error && <ErrorBox>{error}</ErrorBox>}
          <button className="btn primary">Guardar</button>
        </form>
      )}
    </AuthCard>
  );
}

export function VerifyPage() {
  const { token = '' } = useParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<'wait' | 'ok' | string>('wait');
  useEffect(() => {
    api.post('/api/auth/verify', { token }).then(() => { setState('ok'); refresh(); }).catch((e) => setState(errorText(e)));
  }, [token, refresh]);
  return (
    <AuthCard title="Verificar correo">
      {state === 'wait' ? <p className="muted">Verificando…</p> : state === 'ok' ? <p>¡Correo verificado! <Link to="/home">Ir a la app</Link></p> : <ErrorBox>{state}</ErrorBox>}
    </AuthCard>
  );
}
