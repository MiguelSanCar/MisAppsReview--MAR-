import { config } from '../config';

export const STATUSES = ['POR_VER', 'VIENDO', 'FINALIZADO', 'DEJADO'] as const;
export type Status = (typeof STATUSES)[number];

export const CONTENT_TYPES = ['serie', 'pelicula', 'anime'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Duración por episodio (minutos) mientras no se use la duración real (tarea 4.6). */
export const DEFAULT_EPISODE_MINUTES: Record<ContentType, number> = {
  serie: 50,
  pelicula: 90,
  anime: 23,
};

export interface ItemState {
  status: Status;
  watched: number;
}

/** Total de episodios conocido y > 0, o null si se desconoce (p. ej. anime en emisión). */
export const knownTotal = (total: number | null | undefined): number | null =>
  typeof total === 'number' && total > 0 ? total : null;

/**
 * Cambia los episodios vistos. Solo enteros >= 0. Si se alcanza o supera el total
 * se fija el máximo y el estado pasa a FINALIZADO.
 */
export function applyEpisodes(state: ItemState, total: number | null, requested: number): ItemState {
  let w = Math.floor(Number(requested));
  if (!Number.isFinite(w) || w < 0) w = 0;
  const max = knownTotal(total);
  if (max !== null && w >= max) return { status: 'FINALIZADO', watched: max };

  let status = state.status;
  if (w === 0 && (status === 'VIENDO' || status === 'FINALIZADO')) status = 'POR_VER';
  else if (w > 0 && (status === 'POR_VER' || status === 'FINALIZADO')) status = 'VIENDO';
  return { status, watched: w };
}

/** Cambio manual de estado. FINALIZADO marca todos los episodios como vistos. */
export function applyStatus(state: ItemState, total: number | null, next: Status): ItemState {
  const max = knownTotal(total);
  if (next === 'FINALIZADO') return { status: next, watched: max ?? state.watched };
  return { status: next, watched: state.watched };
}

/** Estado al marcar como favorito: pasa a visto (FINALIZADO) con todos los episodios. */
export function applyFavorite(state: ItemState, total: number | null): ItemState {
  return applyStatus(state, total, 'FINALIZADO');
}

/** Minutos por episodio: duración real si está activada y existe; si no, la fija por tipo. */
export function episodeMinutes(type: ContentType, runtimeMinutes?: number | null): number {
  if (config.useRealRuntime && runtimeMinutes && runtimeMinutes > 0) return runtimeMinutes;
  return DEFAULT_EPISODE_MINUTES[type];
}

export const minutesWatched = (type: ContentType, watched: number, runtimeMinutes?: number | null) =>
  Math.max(0, watched) * episodeMinutes(type, runtimeMinutes);

export const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status);
