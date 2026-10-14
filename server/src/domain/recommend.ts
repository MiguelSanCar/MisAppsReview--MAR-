import type { Status } from './rules';

/**
 * Afinidad por género (reglas puras, sin red ni base de datos). Ver docs/DECISIONES.md.
 *
 * Idea: que a alguien le salgan muchas series de «Drama» no significa que le guste más el Drama que el
 * Terror, porque hay muchísimo más Drama en el mercado. Por eso cada género se mide por tres cosas:
 *   1. su presencia en lo que la persona tiene (cada contenido suma 1; más si es favorito o lo ha visto entero,
 *      menos si solo está por ver o lo dejó),
 *   2. su presencia en el mercado (la cuota del género entre los títulos más populares de TMDB),
 *   3. la cantidad de contenidos que tiene en ese género.
 * score = log2(1 + lift) × log2(1 + cantidad), donde lift = presencia propia suavizada / presencia en el mercado.
 */
export type Kind = 'serie' | 'pelicula';

export interface LibItem {
  kind: Kind;
  genres: number[];
  status: Status;
  favorite: boolean;
}

/** Cuánto pesa un contenido según su estado: «vista» = 1, lo demás menos. */
export const STATUS_WEIGHT: Record<Status, number> = { FINALIZADO: 1, VIENDO: 0.8, POR_VER: 0.4, DEJADO: 0.15 };
/** Un favorito pesa el doble. */
export const FAVORITE_BOOST = 2;
/** Con pocos datos la presencia propia se acerca a la media del mercado (equivale a 3 contenidos «medios»). */
export const PRIOR = 3;
/** Un género casi inexistente en el mercado no puede disparar la puntuación. */
export const MIN_MARKET = 0.03;

// Los géneros de series y de películas de TMDB no coinciden del todo («Acción y Aventura» ↔ «Acción» + «Aventura»…).
const MOVIE_TO_TV: Record<number, number[]> = { 28: [10759], 12: [10759], 14: [10765], 878: [10765], 10752: [10768] };
const TV_TO_MOVIE: Record<number, number[]> = { 10759: [28, 12], 10765: [878, 14], 10768: [10752] };

/** Traduce ids de género entre series y películas (los que no tienen equivalente se conservan o se descartan según exista). */
export function mapGenres(ids: number[], from: Kind, to: Kind): number[] {
  if (from === to) return [...new Set(ids)];
  const table = from === 'pelicula' ? MOVIE_TO_TV : TV_TO_MOVIE;
  const other = from === 'pelicula' ? TV_TO_MOVIE : MOVIE_TO_TV;
  const out = new Set<number>();
  for (const g of ids) {
    if (table[g]) table[g].forEach((x) => out.add(x));
    else if (!other[g]) out.add(g); // mismo id en ambos catálogos (Drama, Comedia, Crimen, Animación…)
  }
  return [...out];
}

export interface GenreScore {
  id: number;
  /** Puntuación final (mayor = más afinidad). */
  score: number;
  /** Peso acumulado de tus contenidos en este género. */
  weight: number;
  /** Qué parte de tu lista (ponderada) es de este género, 0-1. */
  userShare: number;
  /** Qué parte del mercado (títulos populares) es de este género, 0-1. */
  marketShare: number;
  /** Cuántas veces más presente está en tu lista que en el mercado (suavizado). */
  lift: number;
}

export const itemWeight = (i: Pick<LibItem, 'status' | 'favorite'>) => STATUS_WEIGHT[i.status] * (i.favorite ? FAVORITE_BOOST : 1);

/**
 * Afinidad de la persona con cada género del tipo `target` (series o películas), de mayor a menor.
 * `market`: cuota de cada género entre los títulos populares de ese tipo (0-1).
 */
export function genreAffinity(items: LibItem[], target: Kind, market: Record<number, number>): GenreScore[] {
  let total = 0;
  const weights = new Map<number, number>();
  for (const it of items) {
    const w = itemWeight(it);
    if (w <= 0) continue;
    total += w;
    for (const g of mapGenres(it.genres, it.kind, target)) weights.set(g, (weights.get(g) ?? 0) + w);
  }
  if (total === 0) return [];
  const out: GenreScore[] = [];
  for (const [id, weight] of weights) {
    const m = Math.max(market[id] ?? 0, MIN_MARKET);
    const userShare = weight / total;
    const smoothed = (weight + PRIOR * m) / (total + PRIOR);
    const lift = smoothed / m;
    out.push({ id, weight, userShare, marketShare: m, lift, score: Math.log2(1 + lift) * Math.log2(1 + weight) });
  }
  return out.sort((a, b) => b.score - a.score || a.id - b.id);
}

export interface Candidate {
  /** Posición original (por popularidad): desempata. */
  index: number;
  genres: number[];
  voteAverage: number | null;
}

/** Cuánto encaja un candidato: suma la afinidad de sus géneros, algo más si tiene buena nota. */
export function candidateScore(c: Candidate, affinity: Map<number, number>): number {
  const fit = c.genres.reduce((s, g) => s + (affinity.get(g) ?? 0), 0);
  const quality = c.voteAverage == null ? 0.5 : Math.min(Math.max((c.voteAverage - 5) / 4, 0), 1); // 5 → 0 · 9 → 1
  return fit * (0.6 + 0.4 * quality);
}

/** Ordena candidatos por encaje (mayor primero), con la popularidad de TMDB como desempate. */
export function rankCandidates<T extends Candidate>(cands: T[], scores: GenreScore[]): (T & { score: number })[] {
  const aff = new Map(scores.map((s) => [s.id, s.score]));
  return cands
    .map((c) => ({ ...c, score: candidateScore(c, aff) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
