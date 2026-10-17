import { config } from '../config';
import { cached, memCached } from '../cache';
import { getJson, guarded, HttpError } from '../http';
import type { ProviderItem } from './types';
import type { MalEntry } from '../importTypes';
import { mapMalStatus } from '../domain/malImport';

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

function call(pathname: string, params: Record<string, string> = {}, fields = FIELDS, timeoutMs = config.malTimeoutMs) {
  if (!config.malClientId) return Promise.reject(new HttpError(503, 'Falta MAL_CLIENT_ID'));
  return guarded(`mal|${config.malBase}`, config.providerDownMs, () =>
    throttled(() =>
      getJson<any>(`${config.malBase}${pathname}?${new URLSearchParams({ ...params, fields })}`, {
        headers: { 'X-MAL-CLIENT-ID': config.malClientId },
        timeoutMs,
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

const LIST_FIELDS = `list_status{status,num_episodes_watched,is_rewatching,num_times_rewatched,updated_at},${FIELDS}`;
const LIST_TIMEOUT_MS = 15_000;
const LIST_MAX_PAGES = 10;

/** Entero ≥ 0 (lo que no lo sea cuenta como 0). */
const count = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Fecha de MAL («2026-09-01T10:00:00+00:00») → ISO con `Z`; null si no es válida. */
const isoDate = (v: unknown) => {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** Un elemento de `data` de la lista → MalEntry; null si el estado no es uno de los cinco de MAL. */
function toEntry(d: any): MalEntry | null {
  const node = d?.node;
  const ls = d?.list_status ?? {};
  if (!node || node.id == null) return null;
  const status = mapMalStatus(ls.status);
  if (!status) return null;
  const item = mapMal(node);
  return {
    malId: Number(node.id),
    title: item.title,
    mediaType: String(node.media_type ?? 'unknown').toLowerCase(),
    totalEpisodes: item.totalEpisodes,
    status,
    watched: count(ls.num_episodes_watched),
    rewatching: !!ls.is_rewatching,
    timesRewatched: count(ls.num_times_rewatched),
    updatedAt: isoDate(ls.updated_at),
    item,
  };
}

/**
 * Lista de anime pública de un usuario de MAL. Valida el nombre (/^[A-Za-z0-9_-]{2,16}$/) sin tocar la red;
 * pagina con offset propio (máx. 10 páginas de `pageSize`, sin seguir la URL de `paging.next`), nsfw=true,
 * timeout de 15 s y sin caché. 404 → HttpError(404, 'No existe ese usuario en MyAnimeList');
 * lista privada (401/403) → HttpError(403, 'La lista de ese usuario es privada…').
 */
export async function fetchUserAnimeList(user: string, pageSize = 1000): Promise<MalEntry[]> {
  if (typeof user !== 'string' || !/^[A-Za-z0-9_-]{2,16}$/.test(user)) {
    throw new HttpError(400, 'Nombre de usuario de MyAnimeList no válido');
  }
  if (!config.malClientId) throw new HttpError(503, 'Falta MAL_CLIENT_ID');
  const out: MalEntry[] = [];
  for (let page = 0; page < LIST_MAX_PAGES; page++) {
    const offset = page * pageSize;
    let data: any;
    try {
      data = await call(
        `/users/${encodeURIComponent(user)}/animelist`,
        { limit: String(pageSize), offset: String(offset), nsfw: 'true' },
        LIST_FIELDS,
        LIST_TIMEOUT_MS,
      );
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0;
      if (status === 404) throw new HttpError(404, 'No existe ese usuario en MyAnimeList');
      if (status === 401 || status === 403) {
        throw new HttpError(403, 'La lista de ese usuario es privada: hazla pública un momento o sube el fichero de exportación');
      }
      throw e;
    }
    const items: any[] = Array.isArray(data?.data) ? data.data : [];
    for (const d of items) {
      const entry = toEntry(d);
      if (entry) out.push(entry);
    }
    // `paging.next` solo indica que hay más: nunca se sigue su URL (podría apuntar a otro sitio). MAL siempre manda
    // `paging` (vacío en la última página); si faltara, se sigue mientras la página venga llena.
    const more = data?.paging && typeof data.paging === 'object' ? !!data.paging.next : items.length >= pageSize;
    if (!more || items.length === 0) break;
  }
  return out;
}

export async function detailMal(externalId: string): Promise<ProviderItem> {
  if (!/^\d+$/.test(externalId)) throw new HttpError(400, 'Identificador MAL no válido');
  const data = await cached(`mal:detail:${externalId}`, 7 * 86400, () => call(`/anime/${externalId}`));
  return mapMal(data);
}
