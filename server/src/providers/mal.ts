import { config } from '../config';
import { cached, memCached } from '../cache';
import { getJson, guarded, HttpError } from '../http';
import type { ProviderItem } from './types';
import type { MalEntry } from '../importTypes';

// API oficial de MyAnimeList (v2). Solo lectura de datos públicos: basta el Client ID (cabecera X-MAL-CLIENT-ID).
// Sustituye a Jikan, cuya API pública cerró el 1 de octubre de 2026.

export const malAvailable = () => !!config.malClientId;

/** MAL rechaza (400) las búsquedas de menos de 3 caracteres. */
export const MAL_MIN_QUERY = 3;

const FIELDS = [
  'id', 'title', 'main_picture', 'alternative_titles', 'start_date', 'start_season', 'synopsis', 'mean',
  'num_list_users', 'num_episodes', 'media_type', 'average_episode_duration', 'studios',
].join(',');

// Sin límite publicado: se serializan las llamadas con un hueco mínimo para no ser un mal cliente.
let chain: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  const gap = () => new Promise((r) => setTimeout(r, config.malMinGapMs));
  chain = run.then(gap, gap);
  return run;
}

function call(pathname: string, params: Record<string, string> = {}) {
  if (!config.malClientId) return Promise.reject(new HttpError(503, 'Falta MAL_CLIENT_ID'));
  return guarded(`mal|${config.malBase}`, config.providerDownMs, () =>
    throttled(() =>
      getJson<any>(`${config.malBase}${pathname}?${new URLSearchParams({ ...params, fields: FIELDS })}`, {
        headers: { 'X-MAL-CLIENT-ID': config.malClientId },
        timeoutMs: config.malTimeoutMs,
      }),
    ),
  );
}

/** Solo una fecha completa sirve como estreno: MAL a veces da solo «2027» o «2027-04». */
const fullDate = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export function mapMal(a: any): ProviderItem {
  const isMovie = a.media_type === 'movie';
  const seconds = Number(a.average_episode_duration);
  const startYear = /^\d{4}/.exec(a.start_date ?? '')?.[0];
  return {
    source: 'mal',
    externalId: String(a.id),
    type: 'anime',
    title: a.alternative_titles?.en || a.title || 'Sin título',
    posterUrl: a.main_picture?.large || a.main_picture?.medium || null,
    synopsis: a.synopsis || null,
    year: a.start_season?.year ?? (startYear ? Number(startYear) : null),
    totalEpisodes: isMovie ? 1 : a.num_episodes > 0 ? a.num_episodes : null,
    runtimeMinutes: seconds > 0 ? Math.round(seconds / 60) : null,
    studio: (a.studios ?? []).map((s: any) => s.name).join(' · ') || null,
    releaseDate: fullDate(a.start_date),
    malScore: typeof a.mean === 'number' ? a.mean : null,
    popularity: typeof a.num_list_users === 'number' ? a.num_list_users / 3000 : null,
  };
}

const nodes = (data: any): ProviderItem[] => (data?.data ?? []).map((d: any) => mapMal(d.node));

export async function searchMal(query: string): Promise<ProviderItem[]> {
  if (query.trim().length < MAL_MIN_QUERY) return [];
  const data = await memCached(`mal:search:${query.toLowerCase()}`, 600, () => call('/anime', { q: query, limit: '20' }));
  return nodes(data);
}

/** Anime en emisión mejor valorado ahora mismo. */
export async function trendingMal(): Promise<ProviderItem[]> {
  const data = await memCached('mal:trending', 3600, () => call('/anime/ranking', { ranking_type: 'airing', limit: '20' }));
  return nodes(data);
}

/**
 * Lista de anime pública de un usuario de MAL (CONTRATO: el agente del proveedor lo implementa). Valida el nombre
 * (/^[A-Za-z0-9_-]{2,16}$/) sin tocar la red; pagina con offset propio (máx. 10 páginas de 1000, sin seguir
 * `paging.next`), nsfw=true y timeout de 15 s. 404 → HttpError(404, 'No existe ese usuario en MyAnimeList');
 * lista privada (401/403) → HttpError(403, 'La lista de ese usuario es privada…').
 */
export async function fetchUserAnimeList(user: string): Promise<MalEntry[]> {
  throw new Error('sin implementar');
}

export async function detailMal(externalId: string): Promise<ProviderItem> {
  if (!/^\d+$/.test(externalId)) throw new HttpError(400, 'Identificador MAL no válido');
  const data = await cached(`mal:detail:${externalId}`, 7 * 86400, () => call(`/anime/${externalId}`));
  return mapMal(data);
}
