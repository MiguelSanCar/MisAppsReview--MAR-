export type Status = 'POR_VER' | 'VIENDO' | 'FINALIZADO' | 'DEJADO';
export type ContentType = 'serie' | 'pelicula' | 'anime';

export const STATUSES: Status[] = ['POR_VER', 'VIENDO', 'FINALIZADO', 'DEJADO'];
export const STATUS_TEXT: Record<Status, string> = {
  POR_VER: 'Por ver',
  VIENDO: 'Viendo',
  FINALIZADO: 'Finalizado',
  DEJADO: 'Dejado',
};
export const TYPE_TEXT: Record<ContentType, string> = { serie: 'Serie', pelicula: 'Película', anime: 'Anime' };

export interface Ratings { imdb?: string; rottenTomatoes?: string; mal?: string }

export interface Content {
  id: number;
  source: string;
  externalId: string;
  type: ContentType;
  title: string;
  posterUrl: string | null;
  synopsis: string | null;
  year: number | null;
  totalEpisodes: number | null;
  runtimeMinutes: number | null;
  studio: string | null;
  ratings: Ratings;
  imdbUrl: string | null;
}

export interface UserState { status: Status; watched: number; favorite: boolean; updatedAt: string }
export interface LibraryItem extends Content { state: UserState }

/** Estado dentro de una lista conjunta (sin favorito). */
export interface ListState { status: Status; watched: number }
export interface ListItem extends Content { state: ListState }

export interface PublicUser { id: number; username: string; avatarUrl: string | null; memberSince: string }
export interface Me extends PublicUser {
  email: string;
  emailVerified: boolean;
  /** true = cualquiera puede ver el perfil; false = solo los amigos. */
  profilePublic: boolean;
  /** En un perfil público, mostrar también la lista de visualizados. */
  showList: boolean;
}

export interface WatchTime { value: number; unit: string; text: string }
export interface Profile {
  user: PublicUser;
  stats: {
    totalMinutes: number;
    watchTime: WatchTime;
    episodes: number;
    byStatus: Record<Status, number>;
    finishedByType: Record<ContentType, number>;
  };
  favorites: LibraryItem[];
}

export interface HistoryEntry {
  id: number;
  contentId: number;
  user: string;
  action: 'add' | 'status' | 'episodes' | 'remove' | 'rollback';
  createdAt: string;
  before: ListState | null;
  after: ListState | null;
  title?: string;
}

export type ProfileAccess = "self" | "friend" | "public";
export type ProfileRelation = "anonymous" | "none" | "pending_out" | "pending_in";

/** Perfil visto por URL (/perfil/<usuario>) con los permisos de quien lo mira. */
export interface ProfileData extends Profile {
  access: ProfileAccess;
  relation: ProfileRelation;
  isPublic: boolean;
  canSeeList: boolean;
  canSeeFriends: boolean;
}

export interface ListMember extends PublicUser { left: boolean }
export interface Inactivity { lastActivityAt: string; deleteAt: string; daysLeft: number; warning: boolean }
export interface ListSummary {
  id: number;
  name: string;
  items: number;
  createdBy: number;
  members: ListMember[];
  myStatus: "active" | "left" | "none";
  inactivity: Inactivity;
}
