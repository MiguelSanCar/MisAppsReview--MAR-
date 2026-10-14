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
  /** Temporadas de la serie (ajustadas a su total); null si no hay estructura. */
  seasons?: Season[] | null;
}

export interface Season { number: number; episodes: number }

export interface UserState {
  status: Status;
  /** Episodios vistos en el visionado actual. */
  watched: number;
  favorite: boolean;
  updatedAt: string;
  /** Veces que se ha vuelto a ver (>0 y «Por ver» = «Reviendo»). */
  rewatch: number;
  /** Episodios de visionados anteriores (siguen contando en las estadísticas). */
  previousEpisodes: number;
}
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
  /** Tema de la interfaz guardado en la cuenta. */
  theme: 'dark' | 'light';
  /** Notificaciones solo de los contenidos favoritos. */
  notifFavoritesOnly: boolean;
  /** Ya vio la ventana explicativa de la campana. */
  notifIntroSeen: boolean;
}

export interface WatchTime { value: number; unit: string; text: string }
export interface Profile {
  user: PublicUser;
  stats: {
    totalMinutes: number;
    watchTime: WatchTime;
    episodes: number;
    /** Temporadas completas vistas. */
    seasonsWatched: number;
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

export interface CompareRow {
  key: string;
  label: string;
  me: number;
  them: number;
  meText: string;
  themText: string;
  winner: 'me' | 'them' | 'tie';
}
export interface CompareData {
  access: ProfileAccess;
  me: PublicUser;
  them: PublicUser;
  rows: CompareRow[];
  summary: { me: number; them: number; ties: number };
}

export interface RecoGenre { id: number; name: string; score: number; lift: number; userShare: number; marketShare: number; weight: number }
export interface Recommendations {
  kind: 'serie' | 'pelicula' | 'anime';
  title: string;
  reason: 'sin_tmdb' | 'sin_datos' | 'anime' | null;
  items: (Content & { why: string | null })[];
  genres: RecoGenre[];
  page: number;
  hasMore: boolean;
  states: Record<number, UserState | null | undefined>;
  warnings: string[];
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

/** Plataforma de la que se recuperan los datos de un contenido. */
export const SOURCE_TEXT: Record<string, string> = { tmdb: 'TMDB', jikan: 'MyAnimeList' };

/** «Reviendo» mientras dure un nuevo visionado (se vuelve a ver algo ya finalizado). */
export const statusLabel = (s: Status, rewatch = 0) => (rewatch > 0 && s === 'POR_VER' ? 'Reviendo' : STATUS_TEXT[s]);

/** «esta serie», «esta película», «este anime» (para los mensajes de confirmación). */
export const THIS_TYPE: Record<ContentType, string> = { serie: 'esta serie', pelicula: 'esta película', anime: 'este anime' };
