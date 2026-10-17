import type { Status } from './domain/rules';
import type { ProviderItem } from './providers/types';

// Contrato de la importación desde MyAnimeList (fase 29): lo comparten el proveedor, el lector del XML,
// las reglas puras y el servicio.

/** Estado de una entrada de MAL normalizado (la API usa `on_hold`; el XML, «On-Hold»: ambos llegan aquí igual). */
export type MalStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';

/** Una entrada de la lista de MAL, venga de la API o del fichero de exportación. */
export interface MalEntry {
  malId: number;
  title: string;
  /** tv, movie, ova, ona, special, music, tv_special, cm, pv, unknown (en minúsculas, igual en API y XML). */
  mediaType: string;
  /** Episodios totales; null si se desconocen (en emisión: MAL da 0). */
  totalEpisodes: number | null;
  status: MalStatus;
  /** Episodios vistos en el visionado actual. */
  watched: number;
  /** Está volviendo a verlo ahora. */
  rewatching: boolean;
  /** Veces que lo ha vuelto a ver y terminado (sin contar el primer visionado). */
  timesRewatched: number;
  /** Última modificación en MAL, ISO 8601 con `Z`; null si no se conoce (XML). */
  updatedAt: string | null;
  /** Ficha normalizada (API: completa); null si solo se conoce lo básico (XML). */
  item: ProviderItem | null;
}

/** Estado completo de una persona sobre un contenido (las 4 columnas de progreso de `user_content`). */
export interface FullState {
  status: Status;
  watched: number;
  /** Episodios de visionados anteriores (`prev_episodes`). */
  prev: number;
  /** Veces que se ha vuelto a ver (`rewatch`). */
  rewatch: number;
}

/** Qué pasa con cada entrada: alta, actualización o se queda como está. */
export type Outcome = 'add' | 'update' | 'same';

export type ImportSource = 'usuario' | 'fichero';

export interface ImportSummary {
  add: number;
  update: number;
  same: number;
  /** Entradas cambiadas por no estar estrenadas (solo «Por ver»). */
  adjusted: number;
  /** Recuento por `mediaType`. */
  byType: Record<string, number>;
}

export interface ImportPreview {
  /** Token de un solo uso para confirmar (caduca a los 10 minutos). */
  token: string;
  source: ImportSource;
  /** Usuario de MAL (por nombre) o nombre que figura en el fichero; null si no se conoce. */
  malUser: string | null;
  total: number;
  summary: ImportSummary;
  /** Hasta 3 ejemplos de lo que se añade o actualiza. */
  sample: { title: string; outcome: Outcome; status: Status; watched: number }[];
}

export interface ImportResult {
  added: number;
  updated: number;
  same: number;
  adjusted: number;
}
