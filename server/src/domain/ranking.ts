/** Orden de resultados: popularidad y coincidencia con lo escrito (reglas puras). */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** 0..1 a partir de la popularidad de TMDB (escala logarítmica: ~500 ya es «muy popular»). */
export const popularityScore = (pop: number | null | undefined): number =>
  pop && pop > 0 ? Math.min(1, Math.log10(1 + pop) / Math.log10(501)) : 0;

/** 0..1 a partir de la nota (0-10): 5 o menos → 0, 9 o más → 1; sin nota, neutro. */
export const qualityScore = (vote: number | null | undefined): number =>
  vote == null ? 0.5 : Math.min(Math.max((vote - 5) / 4, 0), 1);

/** Nota con preferencia por lo popular (es más probable que se haya visto): 60 % nota, 40 % popularidad. */
export const ratingWithPopularity = (vote: number | null | undefined, pop: number | null | undefined): number =>
  0.6 * qualityScore(vote) + 0.4 * popularityScore(pop);

/** Cuánto coincide un título con lo escrito: exacto 3 · empieza por ello 2 · contiene la palabra 1 · contiene el texto 0,5. */
export function titleMatch(title: string, query: string): number {
  const t = norm(title);
  const q = norm(query);
  if (!q || !t) return 0;
  if (t === q) return 3;
  if (t.startsWith(q + ' ') || t.startsWith(q)) return 2;
  if (` ${t} `.includes(` ${q} `)) return 1;
  return t.includes(q) ? 0.5 : 0;
}

/**
 * Ordena los resultados de una búsqueda: primero lo que más coincide con el nombre y, a igualdad, lo más popular.
 * La popularidad (hasta 2 puntos) puede adelantar a un título que coincide algo mejor, pero no a uno que coincide mucho mejor y es conocido.
 * Estable: lo que empata conserva el orden que traía.
 */
export function rankSearch<T extends { title: string; popularity?: number | null }>(items: T[], query: string): T[] {
  return items
    .map((it, i) => {
      const m = titleMatch(it.title, query);
      // Lo que no coincide en absoluto (búsqueda aproximada de TMDB) pesa menos que lo que sí contiene lo escrito
      return { it, i, score: m + (m > 0 ? 2 : 1) * popularityScore(it.popularity) };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.it);
}
