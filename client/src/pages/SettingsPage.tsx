import { useState } from 'react';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import { copyText } from '../clipboard';
import { AvatarCropper } from '../components/AvatarCropper';
import { MalImport } from '../components/MalImport';
import { useToast } from '../components/Toast';
import { Avatar } from '../components/ui';
import { useNotifications } from '../notifications/NotificationsContext';
import { useTheme } from '../theme/ThemeContext';
import type { Me } from '../types';
import { profileUrl } from './ProfilePages';

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const notif = useNotifications();
  const [file, setFile] = useState<File | null>(null);
  const [devLink, setDevLink] = useState<string | undefined>();
  if (!user) return null;

  async function saveAvatar(dataUrl: string) {
    try {
      setUser((await api.put<{ user: Me }>('/api/me/avatar', { dataUrl })).user);
      setFile(null); toast('Foto actualizada', 'ok');
    } catch (e) { toast(errorText(e)); }
  }
  async function removeAvatar() {
    try { setUser((await api.del<{ user: Me }>('/api/me/avatar')).user); } catch (e) { toast(errorText(e)); }
  }
  async function visibility(isPublic: boolean, showList: boolean) {
    try {
      setUser((await api.put<{ user: Me }>('/api/me/visibility', { isPublic, showList })).user);
    } catch (e) { toast(errorText(e)); }
  }
  async function copyProfile() {
    if (await copyText(profileUrl(user!.username))) toast('URL del perfil copiada', 'ok');
  }
  async function copyFriendLink(renew: boolean) {
    if (renew && !window.confirm('El enlace de amistad actual dejará de funcionar. ¿Generar uno nuevo?')) return;
    try {
      const r = await api.post<{ token: string }>(renew ? '/api/invites/revoke' : '/api/invites/mine');
      const ok = await copyText(`${window.location.origin}/invite/${r.token}`);
      if (ok) toast(renew ? 'Enlace nuevo copiado; el anterior ya no funciona' : 'Enlace copiado: quien lo abra con su cuenta te añadirá como amigo', 'ok');
    } catch (e) { toast(errorText(e)); }
  }
  async function sendVerify() {
    try {
      const r = await api.post<{ devLink?: string; alreadyVerified?: boolean }>('/api/auth/verify/send');
      setDevLink(r.devLink);
      toast(r.alreadyVerified ? 'Ya está verificado' : 'Enlace de verificación enviado', 'ok');
    } catch (e) { toast(errorText(e)); }
  }

  return (
    <div className="page settings">
      <h1 className="h1">Ajustes</h1>

      <section className="panel">
        <h2 className="h2">Foto de perfil</h2>
        {file ? (
          <AvatarCropper file={file} onCancel={() => setFile(null)} onDone={saveAvatar} />
        ) : (
          <div className="row">
            <Avatar user={user} size={96} />
            <label className="btn primary file-btn">
              Elegir foto
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
            </label>
            {user.avatarUrl && <button className="btn ghost" onClick={removeAvatar}>Quitar</button>}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="h2">Apariencia</h2>
        <p className="note">Elige el tema de la aplicación. Se guarda en tu cuenta y se aplica cuando entres desde cualquier dispositivo. También puedes cambiarlo con el interruptor de la cabecera.</p>
        <div className="seg" role="radiogroup" aria-label="Tema">
          <button type="button" role="radio" aria-checked={theme === 'dark'} className={`seg-btn ${theme === 'dark' ? 'on' : ''}`} onClick={() => setTheme('dark')}>Oscuro (predeterminado)</button>
          <button type="button" role="radio" aria-checked={theme === 'light'} className={`seg-btn ${theme === 'light' ? 'on' : ''}`} onClick={() => setTheme('light')}>Claro</button>
        </div>
      </section>

      <section className="panel">
        <h2 className="h2">Notificaciones</h2>
        <p className="note">La campana avisa de las novedades de lo que tienes en tu lista: nuevas temporadas y películas relacionadas.</p>
        <label className="check">
          <input
            type="checkbox"
            checked={user.notifFavoritesOnly}
            onChange={(e) => notif.savePrefs({ favoritesOnly: e.target.checked }).catch((err) => toast(errorText(err)))}
          />
          Avisarme solo de mis contenidos favoritos
        </label>
        <p className="muted small">Útil si tu lista es larga y llegan demasiados avisos.</p>
      </section>

      <section className="panel">
        <h2 className="h2">Mi perfil</h2>
        <p className="muted">Tu perfil tiene una URL propia. Decide quién puede abrirla.</p>
        <div className="share-url">
          <input readOnly value={profileUrl(user.username)} aria-label="URL de tu perfil" onFocus={(e) => e.target.select()} />
          <button className="btn primary" onClick={copyProfile}>Copiar</button>
        </div>
        <fieldset className="radios">
          <legend className="visually-hidden">Quién puede ver mi perfil</legend>
          <label className="check">
            <input type="radio" name="vis" checked={!user.profilePublic} onChange={() => visibility(false, false)} />
            <span><b>Solo mis amigos</b> <span className="muted">(por defecto): los demás verán que existe, pero no su contenido.</span></span>
          </label>
          <label className="check">
            <input type="radio" name="vis" checked={user.profilePublic} onChange={() => visibility(true, user.showList)} />
            <span><b>Público</b> <span className="muted">: cualquiera con la URL puede verlo, incluso sin cuenta (solo lectura).</span></span>
          </label>
        </fieldset>
        {user.profilePublic && (
          <label className="check indent">
            <input type="checkbox" checked={user.showList} onChange={(e) => visibility(true, e.target.checked)} />
            Mostrar también mi lista de visualizados
          </label>
        )}
        <p className="muted small">Tus amigos siempre ven tu perfil y tu lista. Tu lista de amigos solo la ven tus amigos.</p>
        {window.location.hostname.match(/^(localhost|127\.)/) && (
          <p className="muted small">Ahora mismo la app solo es accesible en tu equipo (o por el túnel); la URL funcionará para otras personas cuando se despliegue.</p>
        )}
        <MalImport />
      </section>

      <section className="panel">
        <h2 className="h2">Mi enlace de amistad</h2>
        <p className="muted">Quien abra tu enlace con su cuenta pasará a ser tu amigo directamente (también se copia pulsando tu nombre en el menú lateral). Si lo compartes sin querer, renuévalo y el anterior dejará de funcionar.</p>
        <div className="row">
          <button className="btn primary" onClick={() => copyFriendLink(false)}>Copiar mi enlace</button>
          <button className="btn ghost" onClick={() => copyFriendLink(true)}>Renovar enlace</button>
        </div>
      </section>

      <section className="panel">
        <h2 className="h2">Cuenta</h2>
        <p>Usuario: <b>{user.username}</b></p>
        <p>
          Correo: <b>{user.email}</b>{' '}
          {user.emailVerified ? <span className="badge st-FINALIZADO">Verificado</span> : <button className="btn ghost" onClick={sendVerify}>Verificar correo</button>}
        </p>
        {devLink && <p className="note">Modo local: abre <a href={devLink.replace(/^https?:\/\/[^/]+/, '')}>{devLink}</a></p>}
      </section>

      <section className="panel">
        <h2 className="h2">Mis datos</h2>
        <p className="muted">Descarga una copia de tu lista en formato JSON.</p>
        <a className="btn ghost" href="/api/me/export" download>Exportar mis datos</a>
      </section>
    </div>
  );
}
