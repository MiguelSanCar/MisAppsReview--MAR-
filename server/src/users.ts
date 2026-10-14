import { get } from './db';

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  avatar: string | null;
  avatar_v: number;
  share_enabled: number; // obsoleto: sustituido por profile_public (se conserva por los enlaces /u/<token> antiguos)
  share_list: number;
  share_token: string | null;
  profile_public: number;
  email_verified: number;
  theme: string;
  notif_favorites_only: number;
  notif_intro_seen: number;
  news_checked_at: string | null;
  created_at: string;
}

export const getUser = (id: number) => get<UserRow>('SELECT * FROM users WHERE id = ?', [id]);

/** Búsqueda por nombre de usuario (sin distinguir mayúsculas): es la dirección del perfil. */
export const getUserByName = (username: string) => get<UserRow>('SELECT * FROM users WHERE username = ?', [username]);

export const avatarUrl = (u: Pick<UserRow, 'id' | 'avatar' | 'avatar_v'>) =>
  u.avatar ? `/api/avatar/${u.id}?v=${u.avatar_v}` : null;

/** Datos visibles para otras personas. */
export const publicUser = (u: UserRow) => ({
  id: u.id,
  username: u.username,
  avatarUrl: avatarUrl(u),
  memberSince: u.created_at,
});

/** Datos de la propia cuenta. */
export const selfDto = (u: UserRow) => ({
  ...publicUser(u),
  email: u.email,
  emailVerified: !!u.email_verified,
  /** true = cualquiera puede ver el perfil; false = solo tus amigos. */
  profilePublic: !!u.profile_public,
  /** En un perfil público, mostrar también la lista de visualizados. */
  showList: !!u.share_list,
  /** Tema de la interfaz: 'dark' (por defecto) o 'light'. */
  theme: u.theme === 'light' ? 'light' : 'dark',
  /** Notificaciones solo de los contenidos favoritos. */
  notifFavoritesOnly: !!u.notif_favorites_only,
  /** Ya vio la ventana explicativa de la campana. */
  notifIntroSeen: !!u.notif_intro_seen,
});
