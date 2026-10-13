import { config } from '../config';
import { cached, memCached } from '../cache';
import { getJson, guarded, HttpError } from '../http';
import type { ProviderItem } from './types';

export const tmdbAvailable = () => !!config.tmdbKey;

// Acepta la clave v3 (query api_key) o el token v4 (Bearer, empieza por "eyJ").
function call(pathname: string, params: Record<string, string> = {}) {
  if (!config.tmdbKey) throw new HttpError(503, 'Falta TMDB_API_KEY');
  const isBearer = config.tmdbKey.startsWith('eyJ');
  const qs = new URLSearchParams({ language: 'es-ES', ...params });
  if (!isBearer) qs.set('api_key', config.tmdbKey);
  return guarded(`tmdb|${config.tmdbBase}`, config.providerDownMs, () =>
    getJson<any>(`${config.tmdbBase}${pathname}?${qs}`, {
      headers: isBearer ? { Authorization: `Bearer ${config.tmdbKey}` } : {},
      timeoutMs: config.providerTimeoutMs,
    }),
  );
}

const poster = (p?: string | null) => (p ? `${config.tmdbImageBase}${p}` : null);
const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/** Resultado de TMDB → contenido normalizado (null si es anime: lo cubre Jikan). */
function mapResult(r: any, isMovie: boolean): ProviderItem | null {
  if (!isMovie && r.original_language === 'ja' && (r.genre_ids ?? []).includes(16)) return null;
  return {
    source: 'tmdb',
    externalId: `${isMovie ? 'movie' : 'tv'}-${r.id}`,
    type: isMovie ? 'pelicula' : 'serie',
    title: (isMovie ? r.title : r.name) || 'Sin título',
    posterUrl: poster(r.poster_path),
    synopsis: r.overview || null,
    year: yearOf(isMovie ? r.release_date : r.first_air_date),
    totalEpisodes: isMovie ? 1 : null,
    runtimeMinutes: null,
    studio: null,
  };
}

export async function searchTmdb(query: string, type: 'serie' | 'pelicula' | 'todo'): Promise<ProviderItem[]> {
  const data = await memCached(`tmdb:search:${query.toLowerCase()}`, 600, () =>
    call('/search/multi', { query, include_adult: 'false', page: '1' }),
  );
  const items: ProviderItem[] = [];
  for (const r of data.results ?? []) {
    if (r.media_type !== 'movie' && r.media_type !== 'tv') continue;
    const isMovie = r.media_type === 'movie';
    if (type === 'serie' && isMovie) continue;
    if (type === 'pelicula' && !isMovie) continue;
    const item = mapResult(r, isMovie);
    if (item) items.push(item);
  }
  return items;
}

/** Lo más visto de la semana (series o películas). */
export async function trendingTmdb(kind: 'tv' | 'movie'): Promise<ProviderItem[]> {
  const data = await memCached(`tmdb:trending:${kind}`, 3600, () => call(`/trending/${kind}/week`));
  return (data.results ?? []).map((r: any) => mapResult(r, kind === 'movie')).filter(Boolean) as ProviderItem[];
}

export async function detailTmdb(externalId: string): Promise<ProviderItem> {
  const [kind, id] = externalId.split('-');
  if ((kind !== 'movie' && kind !== 'tv') || !/^\d+$/.test(id ?? '')) throw new HttpError(400, 'Identificador TMDB no válido');
  const isMovie = kind === 'movie';
  const r = await cached(`tmdb:detail:${externalId}`, 7 * 86400, () =>
    call(`/${kind}/${id}`, { append_to_response: 'external_ids' }),
  );
  const companies: string[] = (r.production_companies ?? []).map((c: any) => c.name);
  const networks: string[] = (r.networks ?? []).map((c: any) => c.name);
  const studio = [...companies.slice(0, 2), ...(isMovie ? [] : networks.slice(0, 1))].filter(Boolean).join(' · ') || null;
  const total = isMovie ? 1 : r.number_of_episodes > 0 ? r.number_of_episodes : null;
  const runtime = isMovie ? r.runtime : (r.episode_run_time ?? [])[0];
  return {
    source: 'tmdb',
    externalId,
    type: isMovie ? 'pelicula' : 'serie',
    title: (isMovie ? r.title : r.name) || 'Sin título',
    posterUrl: poster(r.poster_path),
    synopsis: r.overview || null,
    year: yearOf(isMovie ? r.release_date : r.first_air_date),
    totalEpisodes: total,
    runtimeMinutes: runtime > 0 ? runtime : null,
    studio,
    imdbId: (isMovie ? r.imdb_id : r.external_ids?.imdb_id) || null,
  };
}
