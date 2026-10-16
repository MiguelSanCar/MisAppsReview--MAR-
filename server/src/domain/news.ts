/**
 * Novedades de los contenidos de una persona (reglas puras, sin red ni base de datos).
 *
 * Idea: de cada contenido que la persona tiene en su lista se guarda una «instantánea» de lo que TMDB sabe hoy
 * (temporadas con su fecha, películas de la misma saga o relacionadas). Cuando el contenido entra en la lista se
 * fija una «base» con lo que ya se conocía; todo lo que aparece después y no está en la base es una novedad.
 */

export interface RelMovie {
  /** Id de TMDB de la película. */
  id: number;
  title: string;
  /** Fecha de estreno (AAAA-MM-DD) o null si aún no tiene. */
  date: string | null;
  poster?: string | null;
  overview?: string | null;
}

export interface SeasonInfo {
  n: number;
  /** Fecha de estreno de la temporada (AAAA-MM-DD) o null si no está anunciada. */
  air: string | null;
  eps: number;
}

export interface TvSnap {
  kind: 'tv';
  /** Estado en TMDB: «Returning Series», «Ended», «Canceled», «In Production»… */
  status: string | null;
  firstAir: string | null;
  seasons: SeasonInfo[];
  /** Películas que parecen derivadas de la serie (spin-off, película, especial) según una heurística. */
  related: RelMovie[];
  /** Cuándo se buscaron las películas relacionadas (ISO). */
  relatedAt?: string;
}

export interface MovieSnap {
  kind: 'movie';
  /** Películas de la misma saga (colección de TMDB), incluida la propia. */
  parts: RelMovie[];
  /** Estreno de la propia película (AAAA-MM-DD). */
  date?: string | null;
}

export type Snap = TvSnap | MovieSnap;

/** Lo que ya se conocía cuando la persona añadió el contenido. */
export interface Base {
  maxSeason: number;
  /** Ids de TMDB de las películas ya conocidas. */
  related: number[];
}

export type NewsKind = 'season_announced' | 'season_released' | 'related_movie' | 'season_removed' | 'movie_removed';

export interface NewsEvent {
  kind: NewsKind;
  /** Clave única por persona: la misma novedad no se avisa dos veces. */
  key: string;
  season?: number;
  airDate?: string | null;
  movie?: RelMovie;
}

export const baseOf = (s: Snap): Base =>
  s.kind === 'tv'
    ? { maxSeason: s.seasons.reduce((m, x) => Math.max(m, x.n), 0), related: s.related.map((r) => r.id) }
    : { maxSeason: 0, related: s.parts.map((p) => p.id) };

export function parseSnap(json: string | null | undefined): Snap | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (v?.kind === 'tv' && Array.isArray(v.seasons) && Array.isArray(v.related)) return v;
    if (v?.kind === 'movie' && Array.isArray(v.parts)) return v;
  } catch { /* se recalcula */ }
  return null;
}

export function parseBase(json: string | null | undefined): Base | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (Number.isInteger(v?.maxSeason) && Array.isArray(v?.related)) return v;
  } catch { /* se recalcula */ }
  return null;
}

/**
 * Novedades de un contenido respecto a su base. Temporadas posteriores a la última conocida: «anunciada» si aún no se
 * ha estrenado, «disponible» si su fecha ya pasó. Películas nuevas de la saga o relacionadas: «película relacionada».
 * `today` = AAAA-MM-DD.
 */
export function diffNews(base: Base, snap: Snap, today: string): NewsEvent[] {
  const out: NewsEvent[] = [];
  if (snap.kind === 'tv') {
    for (const s of [...snap.seasons].sort((a, b) => a.n - b.n)) {
      if (s.n <= base.maxSeason) continue;
      if (s.air && s.air <= today) out.push({ kind: 'season_released', key: `s:${s.n}:r`, season: s.n, airDate: s.air });
      else if (s.air || s.eps > 0) out.push({ kind: 'season_announced', key: `s:${s.n}:a`, season: s.n, airDate: s.air });
      // sin fecha y sin episodios: TMDB solo tiene un hueco, no hay nada que avisar
    }
  }
  const movies = snap.kind === 'tv' ? snap.related : snap.parts;
  for (const m of movies) {
    if (!base.related.includes(m.id)) out.push({ kind: 'related_movie', key: `m:${m.id}`, movie: m, airDate: m.date });
  }
  return out;
}

// --- Películas relacionadas de una serie (heurística) ---

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const NOT_A_MOVIE = /\b(making of|behind the scenes|tras las camaras|documental|documentary|recap|aftershow|after show|extras?|bloopers?|tribute|tributo)\b/;

/**
 * ¿Parece esta película derivada de la serie? TMDB no enlaza series con sus películas, así que se busca por título:
 * debe contener el de la serie como palabras completas (mínimo 4 letras), no estrenarse antes que la serie, no ser
 * un documental ni un «making of». Puede haber falsos positivos (otra obra con el mismo nombre) y se aceptan: solo
 * generan un aviso que la persona puede ignorar.
 */
export function isRelatedMovie(seriesTitle: string, seriesFirstAir: string | null, movie: { title: string; date: string | null; genres?: number[] }): boolean {
  const s = norm(seriesTitle);
  const m = norm(movie.title);
  if (s.length < 4 || !m) return false;
  if (!` ${m} `.includes(` ${s} `)) return false;
  if (movie.genres?.includes(99) || NOT_A_MOVIE.test(m)) return false;
  if (seriesFirstAir && movie.date && movie.date.slice(0, 4) < seriesFirstAir.slice(0, 4)) return false;
  return true;
}

// --- Cuándo volver a consultar ---

export interface NewsTtl { activeMs: number; idleMs: number }

/** Las series en emisión o previstas se revisan a menudo; las terminadas y las películas, rara vez. */
export function ttlFor(snap: Snap | null, cfg: NewsTtl): number {
  if (snap?.kind === 'tv') return /ended|cancel/i.test(snap.status ?? '') ? cfg.idleMs : cfg.activeMs;
  return snap ? cfg.idleMs : 0;
}

/** ¿Toca consultar de nuevo este contenido? (`newsAt` y `now` en ms; null = nunca consultado). */
export function isDue(snap: Snap | null, newsAt: number | null, now: number, cfg: NewsTtl): boolean {
  if (!snap || newsAt == null) return true;
  return now - newsAt >= ttlFor(snap, cfg);
}

// --- Textos ---

const fmt = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/\./g, '');

/** Texto del aviso. `fromMovie`: el contenido de origen es una película (entonces lo relacionado es de su saga). */
export function newsText(ev: Pick<NewsEvent, 'kind' | 'season' | 'airDate'> & { title?: string }, today: string, fromMovie = false): string {
  if (ev.kind === 'season_announced') return `Temporada ${ev.season} anunciada${ev.airDate ? ` · estreno ${fmt(ev.airDate)}` : ''}`;
  if (ev.kind === 'season_removed') return `Temporada ${ev.season} eliminada`;
  if (ev.kind === 'movie_removed') return 'Película eliminada de TMDB: se ha quitado de tu lista';
  if (ev.kind === 'season_released') return `Temporada ${ev.season} ya disponible`;
  const when = ev.airDate ? (ev.airDate <= today ? ` · estrenada ${fmt(ev.airDate)}` : ` · estreno ${fmt(ev.airDate)}`) : '';
  return `${fromMovie ? 'Nueva película de la saga' : 'Película relacionada'}: «${ev.title ?? ''}»${when}`;
}
