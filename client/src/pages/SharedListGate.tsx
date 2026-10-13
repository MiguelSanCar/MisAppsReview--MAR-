import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, errorText } from '../api';
import { useToast } from '../components/Toast';
import { Avatar, ErrorBox, Spinner } from '../components/ui';
import { useProfileCtx } from '../profile/ProfileContext';
import type { ListSummary, PublicUser } from '../types';

interface WithResponse { friend: PublicUser; list: ListSummary | null }

/**
 * «Vuestra lista» (menú del perfil de un amigo): lleva a la lista conjunta de los dos si existe;
 * si no, ofrece crearla directamente (sin pedir permiso a la otra persona).
 */
export default function SharedListGate() {
  const ctx = useProfileCtx()!;
  const toast = useToast();
  const [data, setData] = useState<WithResponse | null>(null);
  const [error, setError] = useState('');
  const [goTo, setGoTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null); setError('');
    api.get<WithResponse>(`/api/lists/with/${encodeURIComponent(ctx.username)}`).then(setData).catch((e) => setError(errorText(e)));
  }, [ctx.username]);

  async function create() {
    if (!data) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: number }>('/api/lists', { friendId: data.friend.id });
      setGoTo(r.id);
    } catch (e) { toast(errorText(e)); setBusy(false); }
  }

  async function rejoin() {
    if (!data?.list) return;
    setBusy(true);
    try {
      await api.post(`/api/lists/${data.list.id}/join`);
      setGoTo(data.list.id);
    } catch (e) { toast(errorText(e)); setBusy(false); }
  }

  if (goTo) return <Navigate to={`/lists/${goTo}`} replace />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  if (!data) return <Spinner />;

  // Ya tenéis lista y estás dentro: se abre directamente
  if (data.list && data.list.myStatus === 'active') return <Navigate to={`/lists/${data.list.id}`} replace />;

  return (
    <div className="page">
      <div className="empty-state">
        <div className="avatars"><Avatar user={data.friend} size={64} /></div>
        {data.list ? (
          <>
            <h1 className="empty-title">Saliste de vuestra lista conjunta</h1>
            <p className="empty-sub">«{data.list.name}» se conserva. Puedes volver a unirte cuando quieras.</p>
            {data.list.inactivity.warning && (
              <p className="note">Se borrará el {new Date(data.list.inactivity.deleteAt).toLocaleDateString('es-ES')} si nadie la modifica.</p>
            )}
            <button className="btn primary lg" onClick={rejoin} disabled={busy}>Volver a unirme</button>
          </>
        ) : (
          <>
            <h1 className="empty-title">Aún no tenéis una lista conjunta</h1>
            <p className="empty-sub">Crea una lista conjunta e invita a tu amigo</p>
            <button className="btn primary lg" onClick={create} disabled={busy}>Crear nueva lista conjunta</button>
            <p className="muted small">Se crea al momento y {data.friend.username} la verá sin tener que aceptar nada. Cualquiera de los dos puede salir de ella cuando quiera.</p>
          </>
        )}
      </div>
    </div>
  );
}
