import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, errorText } from '../api';
import type { ProfileData, ProfileRelation } from '../types';

/** Estado de un perfil visto por su URL (/perfil/<usuario>) con los permisos de quien lo mira. */
export type ProfileState =
  | { status: 'loading' }
  | { status: 'ok'; data: ProfileData }
  | { status: 'private'; user: { username: string; avatarUrl: string | null }; relation: ProfileRelation }
  | { status: 'notfound' }
  | { status: 'error'; message: string };

export interface ProfileCtxValue {
  username: string;
  state: ProfileState;
  reload: () => void;
}

export const ProfileCtx = createContext<ProfileCtxValue | null>(null);
/** null fuera de las rutas /perfil/:username */
export const useProfileCtx = () => useContext(ProfileCtx);

export function useProfileState(username: string, viewerKey: number | undefined): ProfileCtxValue {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    api.get<ProfileData>(`/api/profiles/${encodeURIComponent(username)}`)
      .then((data) => live && setState({ status: 'ok', data }))
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 403 && e.data?.code === 'private') {
          setState({ status: 'private', user: e.data.user, relation: e.data.relation });
        } else if (e instanceof ApiError && e.status === 404) {
          setState({ status: 'notfound' });
        } else {
          setState({ status: 'error', message: errorText(e) });
        }
      });
    return () => { live = false; };
    // viewerKey: al iniciar o cerrar sesión cambian los permisos y hay que volver a pedirlo
  }, [username, viewerKey, tick]);

  return { username, state, reload };
}
