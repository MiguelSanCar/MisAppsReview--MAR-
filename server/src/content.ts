import { all, get, run } from './db';
import { HttpError } from './http';
import type { ContentType } from './domain/rules';
import { normalizeSeasons, parseSeasons, Season } from './domain/seasons';
import { rankSearch } from './domain/ranking';
import { isFuture, watchableEpisodes } from './domain/release';
import { scheduleRuntimes } from './runtimes';
import { config } from './config';
import { detailJikan, searchJikan, trendingJikan } from './providers/jikan';
import { detailTmdb, searchTmdb, tmdbAvailable, trendingTmdb } from './providers/tmdb';
import { omdbAvailable, ratingsByImdbId } from './providers/omdb';
import type { ProviderItem, Ratings } from './providers/types';

export interface ContentRow {
  id: number;
  source: 'tmdb' | 'jikan';
  external_id: string;
  type: ContentType;
  title: string;
  poster_url: string | null;
  synopsis: string | null;
  year: number | null;
  total_episodes: number | null;
  /** Estreno (AAAA-MM-DD); null = sin dato. */
  release_date: string | null;
  runtime_minutes: number | null;
  studio: string | null;
  imdb_id: string | null;
  ratings: string | null;
  detailed_at: string | null;
  ratings_at: string | null;
  ratings_try_at: string | null;
  /** JSON con ids de género de TMDB; null = sin consultar. */
  genres: string | null;
  /** JSON [{number, episodes}]; null = sin consultar. */
  seasons: string | null;
}

export interface ContentDto {
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
  /** Temporadas de la serie ajustadas a su total de episodios; null si no hay estructura (anime, películas, sin datos). */
  seasons: Season[] | null;
  /** Estreno (AAAA-MM-DD) de la película o de la serie. */
  releaseDate: string | null;
  /** Aún no se ha estrenado: solo admite «Por ver». */
  unreleased: boolean;
  /** Episodios que ya se pueden marcar (menos que el total si hay temporadas por estrenar); null = todos. */
  watchable: number | null;
}

const nowIso = () => new Date().toISOString();
const DAY = 86400_000;

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function toDto(r: ContentRow): ContentDto {
  const seasons = normalizeSeasons(parseSeasons(r.seasons), r.total_episodes);
  const unreleased = isFuture(r.release_date, todayIso());
  return {
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    type: r.type,
    title: r.title,
    posterUrl: r.poster_url,
    synopsis: r.synopsis,
    year: r.year,
    totalEpisodes: r.total_episodes,
    runtimeMinutes: r.runtime_minutes,
    studio: r.studio,
    ratings: r.ratings ? JSON.parse(r.ratings) : {},
    imdbUrl: r.imdb_id ? `https://www.imdb.com/title/${r.imdb_id}/` : null,
    seasons,
    releaseDate: r.release_date,
    unreleased,
    watchable: watchableEpisodes({ unreleased, total: r.total_episodes, seasons }, todayIso()),
  };
}

export const getContent = (id: number) => get<ContentRow>('SELECT * FROM content WHERE id = ?', [id]);

const malText = (s?: number | null) => (typeof s === 'number' ? `${s.toFixed(2)}/10` : null);

/** Guarda/actualiza un resultado de búsqueda sin pisar datos ya completos con nulos. */
export function upsertFromProvider(i: ProviderItem): ContentRow {
  const ex = get<ContentRow>("SELECT * FROM content WHERE source = ? AND external_id = ?", [i.source, i.externalId]);
  // Con la búsqueda "al escribir" llegan los mismos resultados una y otra vez: no se escribe si no hay nada nuevo.
  if (
    ex &&
    ex.title === i.title &&
    !((!ex.poster_url && i.posterUrl) || (!ex.synopsis && i.synopsis) || (!ex.year && i.year) ||
      (ex.total_episodes == null && i.totalEpisodes != null) || (ex.studio == null && i.studio) ||
      (ex.runtime_minutes == null && i.runtimeMinutes != null) || (!ex.ratings && malText(i.malScore)) ||
      (ex.genres == null && i.genres?.length) || (i.releaseDate && ex.release_date !== i.releaseDate))
  ) {
    return ex;
  }
  run(
    `INSERT INTO content (source, external_id, type, title, poster_url, synopsis, year, total_episodes, runtime_minutes, studio, imdb_id, genres, release_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, external_id) DO UPDATE SET
       title = excluded.title,
       poster_url = COALESCE(excluded.poster_url, content.poster_url),
       synopsis = COALESCE(excluded.synopsis, content.synopsis),
       year = COALESCE(excluded.year, content.year),
       total_episodes = COALESCE(content.total_episodes, excluded.total_episodes),
       runtime_minutes = COALESCE(content.runtime_minutes, excluded.runtime_minutes),
       studio = COALESCE(content.studio, excluded.studio),
       genres = COALESCE(content.genres, excluded.genres),
       release_date = COALESCE(excluded.release_date, content.release_date)`,
    [i.source, i.externalId, i.type, i.title, i.posterUrl, i.synopsis, i.year, i.totalEpisodes, i.runtimeMinutes, i.studio, i.imdbId ?? null, i.genres?.length ? JSON.stringify(i.genres) : null, i.releaseDate ?? null],
  );
  const row = get<ContentRow>('SELECT * FROM content WHERE source = ? AND external_id = ?', [i.source, i.externalId])!;
  const mal = malText(i.malScore);
  if (mal && !row.ratings) {
    run('UPDATE content SET ratings = ?, ratings_at = ? WHERE id = ?', [JSON.stringify({ mal }), nowIso(), row.id]);
    return getContent(row.id)!;
  }
  return row;
}

/** Completa los datos de la ficha (episodios totales, estudio, id de IMDb...) la primera vez. */
export async function ensureCore(row: ContentRow): Promise<ContentRow> {
  if (row.detailed_at) return row;
  const d = row.source === 'tmdb' ? await detailTmdb(row.external_id) : await detailJikan(row.external_id);
  run(
    `UPDATE content SET title = ?, poster_url = COALESCE(?, poster_url), synopsis = COALESCE(?, synopsis),
       year = COALESCE(?, year), total_episodes = ?, runtime_minutes = ?, studio = ?, imdb_id = COALESCE(?, imdb_id),
       genres = COALESCE(?, genres), seasons = COALESCE(?, seasons), release_date = COALESCE(?, release_date), detailed_at = ? WHERE id = ?`,
    [d.title, d.posterUrl, d.synopsis, d.year, d.totalEpisodes, d.runtimeMinutes, d.studio, d.imdbId ?? null, d.genres?.length ? JSON.stringify(d.genres) : null, d.seasons ? JSON.stringify(d.seasons) : null, d.releaseDate ?? null, nowIso(), row.id],
  );
  const mal = malText(d.malScore);
  if (mal) run('UPDATE content SET ratings = ?, ratings_at = ? WHERE id = ?', [JSON.stringify({ mal }), nowIso(), row.id]);
  if (d.seasons?.length) scheduleRuntimes(row.id); // duración real de los episodios, en segundo plano
  return getContent(row.id)!;
}

/**
 * Las series guardadas antes de existir la columna `seasons` no tienen estructura: se completa la primera vez que se
 * abre su ficha (el detalle de TMDB ya está en caché de 7 días). Si TMDB no da temporadas se guarda [] para no insistir.
 */
export async function ensureSeasons(row: ContentRow): Promise<ContentRow> {
  if (row.seasons != null || row.source !== 'tmdb' || row.type !== 'serie' || !row.detailed_at) return row;
  try {
    const d = await detailTmdb(row.external_id);
    run('UPDATE content SET seasons = ? WHERE id = ?', [JSON.stringify(d.seasons ?? []), row.id]);
    if (d.seasons?.length) scheduleRuntimes(row.id);
    return getContent(row.id)!;
  } catch {
    return row; // se reintentará la próxima vez
  }
}

/** IMDb + Rotten Tomatoes vía OMDb (series y películas). Si falla, reintenta pasados 10 minutos. */
export async function ensureRatings(row: ContentRow): Promise<ContentRow> {
  if (row.source !== 'tmdb' || !row.imdb_id || !omdbAvailable()) return row;
  const fresh = row.ratings_at && Date.now() - Date.parse(row.ratings_at) < 7 * DAY;
  const triedRecently = row.ratings_try_at && Date.now() - Date.parse(row.ratings_try_at) < 10 * 60_000;
  if (fresh || triedRecently) return row;
  try {
    const ratings = await ratingsByImdbId(row.imdb_id);
    run('UPDATE content SET ratings = ?, ratings_at = ?, ratings_try_at = NULL WHERE id = ?', [JSON.stringify(ratings), nowIso(), row.id]);
  } catch {
    run('UPDATE content SET ratings_try_at = ? WHERE id = ?', [nowIso(), row.id]);
  }
  return getContent(row.id)!;
}

export async function loadContent(id: number): Promise<ContentRow> {
  const row = getContent(id);
  if (!row) throw new HttpError(404, 'Contenido no encontrado');
  return row;
}

/** Contenido con datos completos; si el proveedor falla da un error claro. */
export async function loadCore(id: number): Promise<ContentRow> {
  const row = await loadContent(id);
  try {
    return await ensureCore(row);
  } catch {
    throw new HttpError(502, 'No se pudieron obtener los datos del contenido. Inténtalo de nuevo en un momento.');
  }
}

export interface SearchStatus {
  tmdb: boolean;
  omdb: boolean;
  jikan: boolean;
}
export const searchStatus = (): SearchStatus => ({ tmdb: tmdbAvailable(), omdb: omdbAvailable(), jikan: config.jikanEnabled });

export type SearchType = "todo" | ContentType;

type Settled<T> = { ok: true; value: T } | { ok: false; reason: "error" | "slow" | "down"; detail?: string };

/** Espera a un proveedor como mucho `ms`; si tarda más, se sigue sin él (su respuesta quedará en caché para la siguiente). */
function settle<T>(p: Promise<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, reason: "slow" }), ms);
    p.then(
      (value) => { clearTimeout(t); resolve({ ok: true, value }); },
      (e) => {
        clearTimeout(t);
        // 503 «temporalmente» = el corte automático ya sabía que este proveedor no responde
        resolve({ ok: false, reason: e instanceof HttpError && e.status === 503 && /temporalmente/.test(e.message) ? "down" : "error", detail: e instanceof HttpError ? `${e.status} ${e.message}` : String(e?.message ?? e) });
      },
    );
  });
}

const interleave = (lists: ProviderItem[][]) => {
  const merged: ProviderItem[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) merged.push(l[i]);
  return merged;
};

type Job = { label: string; p: Promise<ProviderItem[]>; softMs: number };

async function gather(jobs: Job[], warnings: string[]) {
  const settled = await Promise.all(jobs.map((j) => settle(j.p, j.softMs)));
  const lists: ProviderItem[][] = [];
  settled.forEach((s, i) => {
    const label = jobs[i].label;
    if (s.ok) { lists.push(s.value); return; }
    // Queda en el registro del servidor (`fly logs`) para saber por qué un proveedor no responde
    if (process.env.NODE_ENV !== "test") console.warn(`[búsqueda] ${label}: ${s.reason}${s.detail ? ` (${s.detail})` : ""}`);
    if (s.reason === "slow") warnings.push(`${label} tarda más de lo normal; sus resultados aparecerán en la siguiente búsqueda.`);
    else if (s.reason === "down") warnings.push(`${label} no responde ahora mismo (¿red bloqueada?); se omite un rato y se volverá a probar solo.`);
    else warnings.push(`No se pudo consultar ${label}. Inténtalo de nuevo más tarde.`);
  });
  return interleave(lists);
}

const JIKAN_OFF = "La búsqueda de anime está desactivada (JIKAN_ENABLED=false).";

/** Buscador único: combina TMDB (series/películas) y Jikan (anime) y entrelaza resultados. */
async function searchProviders(q: string, type: SearchType) {
  const warnings: string[] = [];
  const jobs: Job[] = [];
  if (type !== "anime") {
    if (!tmdbAvailable()) warnings.push("Falta TMDB_API_KEY: la búsqueda de series y películas no está disponible.");
    else jobs.push({ label: "TMDB", softMs: config.tmdbSoftMs, p: searchTmdb(q, type === "serie" ? "serie" : type === "pelicula" ? "pelicula" : "todo") });
  }
  if (type === "anime" || type === "todo") {
    if (config.jikanEnabled) jobs.push({ label: "MyAnimeList (Jikan)", softMs: config.jikanSoftMs, p: searchJikan(q) });
    else if (type === "anime") warnings.push(JIKAN_OFF);
  }
  return { items: await gather(jobs, warnings), warnings };
}

export async function search(q: string, type: SearchType) {
  const { items, warnings } = await searchProviders(q, type);
  // Primero lo que más coincide con lo escrito y, entre ello, lo más popular
  return { results: rankSearch(items, q).map((i) => toDto(upsertFromProvider(i))), warnings };
}

/** Lo más visto del momento: series (por defecto), películas o anime. Sin clave de TMDB, la portada cae en anime. */
export async function trending(type: SearchType) {
  const warnings: string[] = [];
  let kind: "serie" | "pelicula" | "anime" = type === "todo" ? "serie" : type;
  if (kind !== "anime" && !tmdbAvailable()) {
    if (type === "todo") kind = "anime";
    else warnings.push("Falta TMDB_API_KEY: no se pueden mostrar series ni películas.");
  }
  let items: ProviderItem[] = [];
  if (kind === "anime" && !config.jikanEnabled) {
    warnings.push(JIKAN_OFF);
  } else if (!(kind !== "anime" && !tmdbAvailable())) {
    const label = kind === "anime" ? "MyAnimeList (Jikan)" : "TMDB";
    const p = kind === "anime" ? trendingJikan() : trendingTmdb(kind === "pelicula" ? "movie" : "tv");
    items = await gather([{ label, p, softMs: kind === "anime" ? config.jikanSoftMs : config.tmdbSoftMs }], warnings);
  }
  const title = kind === "serie" ? "Series más vistas del momento" : kind === "pelicula" ? "Películas más vistas del momento" : "Anime más visto del momento";
  return { title, kind, results: items.map((i) => toDto(upsertFromProvider(i))), warnings };
}

export function contentByIds(ids: number[]): ContentRow[] {
  if (!ids.length) return [];
  return all<ContentRow>(`SELECT * FROM content WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
}
