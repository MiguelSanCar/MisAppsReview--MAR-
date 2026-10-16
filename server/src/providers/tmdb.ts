import { config } from '../config';
import { cached, memCached } from '../cache';
import { getJson, guarded, HttpError } from '../http';
import { cleanDate } from '../domain/release';
import { isRelatedMovie, MovieSnap, RelMovie, TvSnap } from '../domain/news';
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
    releaseDate: cleanDate(isMovie ? r.release_date : r.first_air_date),
    totalEpisodes: isMovie ? 1 : null,
    runtimeMinutes: null,
    studio: null,
    genres: Array.isArray(r.genre_ids) ? r.genre_ids : undefined,
    voteAverage: typeof r.vote_average === 'number' ? r.vote_average : null,
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
    releaseDate: cleanDate(isMovie ? r.release_date : r.first_air_date),
    totalEpisodes: total,
    runtimeMinutes: runtime > 0 ? runtime : null,
    studio,
    imdbId: (isMovie ? r.imdb_id : r.external_ids?.imdb_id) || null,
    genres: Array.isArray(r.genres) ? r.genres.map((g: any) => g.id).filter((n: any) => Number.isInteger(n)) : undefined,
    seasons: isMovie ? undefined : (Array.isArray(r.seasons) ? r.seasons : [])
      .filter((s: any) => s.season_number > 0 && s.episode_count > 0)
      .map((s: any) => ({ number: s.season_number, episodes: s.episode_count, ...(cleanDate(s.air_date) ? { air: s.air_date } : {}) })),
  };
}

/** Duración (min) de cada episodio de una temporada, en orden; null donde TMDB no la tiene. Caché de 30 días. */
export async function seasonRuntimesTmdb(externalId: string, season: number): Promise<(number | null)[]> {
  const [kind, id] = externalId.split('-');
  if (kind !== 'tv' || !/^\d+$/.test(id ?? '') || !Number.isInteger(season) || season < 1) throw new HttpError(400, 'Temporada no válida');
  const r = await cached(`tmdb:season:${externalId}:${season}`, 30 * 86400, () => call(`/tv/${id}/season/${season}`));
  return (Array.isArray(r.episodes) ? r.episodes : []).map((e: any) => (e.runtime > 0 ? Math.round(e.runtime) : null));
}

export type TmdbKind = 'tv' | 'movie';

/** Descubrimiento de TMDB: por popularidad, o filtrado por géneros (con buena nota y votos suficientes). */
export async function discoverTmdb(kind: TmdbKind, opts: { genres?: number[]; page?: number; quality?: boolean } = {}): Promise<ProviderItem[]> {
  const params: Record<string, string> = { sort_by: 'popularity.desc', include_adult: 'false', page: String(opts.page ?? 1) };
  if (opts.genres?.length) params.with_genres = opts.genres.join('|'); // «|» = cualquiera de ellos
  if (opts.quality) { params['vote_count.gte'] = '200'; params['vote_average.gte'] = '6.5'; }
  const key = `tmdb:discover:${kind}:${JSON.stringify(params)}`;
  const data = await memCached(key, 6 * 3600, () => call(`/discover/${kind}`, params));
  return (data.results ?? []).map((r: any) => mapResult(r, kind === 'movie')).filter(Boolean) as ProviderItem[];
}

/** Nombres de género en español (id → nombre). Cambian muy poco: caché persistente de 30 días. */
export async function genreNamesTmdb(kind: TmdbKind): Promise<Record<number, string>> {
  const data = await cached(`tmdb:genres:${kind}`, 30 * 86400, () => call(`/genre/${kind}/list`));
  return Object.fromEntries((data.genres ?? []).map((g: any) => [g.id, g.name]));
}

export type DiscoverSort = 'popularity' | 'rating' | 'date';
export interface DiscoverFilters {
  kind: TmdbKind;
  page: number;
  sort: DiscoverSort;
  genre?: number;
  /** Id de plataforma de streaming de TMDB (p. ej. 8 = Netflix). */
  platform?: number;
  /** Id de productora/estudio de TMDB. */
  studio?: number;
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
}
export interface DiscoverPage { items: ProviderItem[]; page: number; totalPages: number }

/** Búsqueda avanzada: descubrimiento de TMDB con filtros combinables. */
export async function discoverFiltered(f: DiscoverFilters): Promise<DiscoverPage> {
  const movie = f.kind === 'movie';
  const dateField = movie ? 'primary_release_date' : 'first_air_date';
  const sortField = f.sort === 'rating' ? 'vote_average' : f.sort === 'date' ? dateField : 'popularity';
  const params: Record<string, string> = {
    sort_by: `${sortField}.desc`, include_adult: 'false', page: String(f.page),
    watch_region: config.tmdbRegion, // siempre: acota las plataformas a tu país
  };
  if (f.genre) params.with_genres = String(f.genre);
  if (f.platform) { params.with_watch_providers = String(f.platform); params.with_watch_monetization_types = 'flatrate|free|ads'; }
  if (f.studio) params.with_companies = String(f.studio);
  if (f.yearFrom) params[`${dateField}.gte`] = `${f.yearFrom}-01-01`;
  if (f.yearTo) params[`${dateField}.lte`] = `${f.yearTo}-12-31`;
  if (f.minRating) params['vote_average.gte'] = String(f.minRating);
  // Ordenar por nota sin exigir votos mínimos llena de títulos con un solo voto
  if (f.sort === 'rating' || f.minRating) params['vote_count.gte'] = '150';
  // Por fecha, que no aparezcan estrenos futuros sin datos
  if (f.sort === 'date' && !f.yearTo) params[`${dateField}.lte`] = new Date().toISOString().slice(0, 10);
  const data = await memCached(`tmdb:advanced:${f.kind}:${JSON.stringify(params)}`, 1800, () => call(`/discover/${f.kind}`, params));
  return {
    items: (data.results ?? []).map((r: any) => mapResult(r, movie)).filter(Boolean) as ProviderItem[],
    page: Number(data.page) || f.page,
    totalPages: Math.min(Number(data.total_pages) || 1, 500), // TMDB no sirve más de 500 páginas
  };
}

export interface NamedId { id: number; name: string }

/** Plataformas de streaming disponibles en la región, por orden de importancia (caché de 24 h). */
export async function providersTmdb(kind: TmdbKind): Promise<NamedId[]> {
  const data = await cached(`tmdb:providers:${kind}:${config.tmdbRegion}`, 86400, () => call(`/watch/providers/${kind}`, { watch_region: config.tmdbRegion }));
  return (data.results ?? [])
    .sort((a: any, b: any) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .slice(0, 40)
    .map((p: any) => ({ id: p.provider_id, name: p.provider_name }));
}

/** Productoras/estudios cuyo nombre contiene el texto (para el filtro «estudio»). */
export async function searchCompaniesTmdb(q: string): Promise<NamedId[]> {
  const data = await memCached(`tmdb:company:${q.toLowerCase()}`, 3600, () => call('/search/company', { query: q, page: '1' }));
  return (data.results ?? []).slice(0, 8).map((c: any) => ({ id: c.id, name: c.name }));
}

// --- Novedades (notificaciones) ---
// Estas consultas NO usan la caché de detalle: la frecuencia con la que se repiten la decide la base de datos
// (domain/news.ts: `ttlFor`), para no pedir lo mismo una y otra vez ni quedarse con datos viejos.

const relOf = (r: any): RelMovie => ({
  id: r.id,
  title: r.title || r.original_title || 'Sin título',
  date: r.release_date || null,
  poster: r.poster_path ? poster(r.poster_path) : null,
  overview: r.overview || null,
});

/** Película de TMDB lista para guardarla como contenido (sin pedir nada más). */
export const movieItemFromRel = (m: RelMovie): ProviderItem => ({
  source: 'tmdb',
  externalId: `movie-${m.id}`,
  type: 'pelicula',
  title: m.title,
  posterUrl: m.poster ?? null,
  synopsis: m.overview ?? null,
  year: yearOf(m.date ?? undefined),
  releaseDate: cleanDate(m.date),
  totalEpisodes: 1,
  runtimeMinutes: null,
  studio: null,
});

/** Estado, temporadas (con fecha) y películas relacionadas de una serie. */
export async function newsTv(externalId: string, prev: TvSnap | null, relatedTtlMs: number): Promise<TvSnap> {
  const id = externalId.split('-')[1];
  if (!/^\d+$/.test(id ?? '')) throw new HttpError(400, 'Identificador TMDB no válido');
  const d = await call(`/tv/${id}`);
  const seasons = (Array.isArray(d.seasons) ? d.seasons : [])
    .filter((x: any) => x.season_number > 0)
    .map((x: any) => ({ n: x.season_number, air: x.air_date || null, eps: x.episode_count || 0 }));
  let related = prev?.related ?? [];
  let relatedAt = prev?.relatedAt;
  // Las películas relacionadas se buscan con poca frecuencia: aparecen raramente y cuesta una petición extra
  if (!relatedAt || Date.now() - Date.parse(relatedAt) >= relatedTtlMs) {
    const q = await call('/search/movie', { query: String(d.name ?? ''), include_adult: 'false', page: '1' });
    related = (q.results ?? [])
      .filter((m: any) => isRelatedMovie(String(d.name ?? ''), d.first_air_date || null, { title: m.title || '', date: m.release_date || null, genres: m.genre_ids }))
      .sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 5)
      .map(relOf);
    relatedAt = new Date().toISOString();
  }
  return { kind: 'tv', status: d.status ?? null, firstAir: d.first_air_date || null, seasons, related, relatedAt };
}

/** Películas de la misma saga (colección de TMDB), incluida la propia. */
export async function newsMovie(externalId: string): Promise<MovieSnap> {
  const id = externalId.split('-')[1];
  if (!/^\d+$/.test(id ?? '')) throw new HttpError(400, 'Identificador TMDB no válido');
  let d: any;
  try {
    d = await call(`/movie/${id}`);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) { const gone = new HttpError(404, 'La película ya no existe en TMDB'); gone.code = 'gone'; throw gone; }
    throw e;
  }
  const self = relOf({ ...d, id: Number(id) });
  const cid = d.belongs_to_collection?.id;
  const date = cleanDate(d.release_date);
  if (!cid) return { kind: 'movie', parts: [self], date };
  const col = await call(`/collection/${cid}`).catch((e) => { if (e instanceof HttpError && e.status === 404) return { parts: [] }; throw e; });
  const parts: RelMovie[] = (col.parts ?? []).map(relOf);
  if (!parts.some((p) => p.id === self.id)) parts.push(self);
  return { kind: 'movie', parts, date };
}
