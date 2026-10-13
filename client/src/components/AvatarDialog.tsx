import { useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { Me, PublicUser } from '../types';
import { AvatarCropper } from './AvatarCropper';
import { useToast } from './Toast';
import { Avatar, Icon } from './ui';

/**
 * Ventana de la foto de perfil (se abre al pulsar la imagen del menú lateral):
 * muestra la imagen actual y, si es la propia, permite cambiarla o quitarla.
 */
export function AvatarDialog({ user, canEdit, onClose }: { user: PublicUser; canEdit: boolean; onClose: () => void }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save(dataUrl: string) {
    try {
      setUser((await api.put<{ user: Me }>('/api/me/avatar', { dataUrl })).user);
      setFile(null);
      toast('Foto actualizada', 'ok');
    } catch (e) { toast(errorText(e)); }
  }

  async function remove() {
    try {
      setUser((await api.del<{ user: Me }>('/api/me/avatar')).user);
      toast('Foto eliminada', 'ok');
    } catch (e) { toast(errorText(e)); }
  }

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={`Foto de perfil de ${user.username}`} onClick={onClose}>
      <div className="modal avatar-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        <h2 className="h2 first">{canEdit ? 'Tu foto de perfil' : `Foto de ${user.username}`}</h2>

        {file ? (
          <AvatarCropper file={file} onCancel={() => setFile(null)} onDone={save} />
        ) : (
          <>
            <div className="avatar-big"><Avatar user={user} size={240} /></div>
            {!user.avatarUrl && <p className="muted center">{canEdit ? 'Todavía no tienes foto.' : 'No tiene foto.'}</p>}
            {canEdit && (
              <div className="row center-row">
                <label className="btn primary file-btn">
                  {user.avatarUrl ? 'Actualizar foto' : 'Subir foto'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
                </label>
                {user.avatarUrl && <button className="btn ghost danger" onClick={remove}>Quitar foto</button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
