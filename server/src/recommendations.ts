import { all, run } from './db';
import { cached } from './cache';
import { ContentDto, toDto, upsertFromProvider } from './content';
import { ContentType, Status } from './domain/rules';
import { genreAffinity, Kind, LibItem, rankCandidates } from './domain/recommend';
import { detailTmdb, discoverTmdb, genreNamesTmdb, tmdbAvailable, TmdbKind } from './providers/tmdb';
import type { ProviderItem } from './providers/types';

const TK: Record<Kind, TmdbKind> = { serie: 'tv', pelicula: 'movie' };
/** Contenidos sin géneros que se completan en cada petición (el resto, en las siguientes). */
const BACKFILL_MAX = 8;
const TOP_GENRES = 3;
const RESULTS = 20;
/** Páginas de TMDB que se recorren como máximo (TMDB no sirve más de 500): en la práctica, scroll sin fin. */
export const MAX_RECO_PAGES = 500;

interface Row { id: number; source: string; external_id: string; type: ContentType; genres: string | null; status: Status; is_favorite: number }

export interface RecoGenre { id: number; name: string; score: number; lift: number; userShare: number; marketShare: number; weight: number }
export type RecoReason = 'sin_tmdb' | 'sin_datos' | 'anime' | null;
export interface Recommendations {
  kind: 'serie' | 'pelicula' | 'anime';
  title: string;
  reason: RecoReason;
  items: (ContentDto & { why: string | null })[];
  /** Los géneros con más afinidad (para entender de dónde salen las recomendaciones). */
  genres: RecoGenre[];
  page: number;
  /** Hay otra página con más candidatos de tus géneros. */
  hasMore: boolean;
  warnings: string[];
}

/** Cuota de cada género entre los títulos más populares de TMDB (3 páginas ≈ 60 títulos); caché de 24 h. */
export async function marketShares(kind: Kind): Promise<Record<number, number>> {
  return cached(`reco:market:${kind}`, 24 * 3600, async () => {
    const pages = await Promise.all([1, 2, 3].map((page) => discoverTmdb(TK[kind], { page }).catch(() => [] as ProviderItem[])));
    const titles = pages.flat().filter((t) => t.genres?.length);
    const count: Record<number, number> = {};
    for (const t of titles) for (const g of new Set(t.genres)) count[g] = (count[g] ?? 0) + 1;
    return Object.fromEntries(Object.entries(count).map(([g, n]) => [g, n / titles.length]));
  });
}

/** Completa los géneros de lo que ya estaba guardado antes de existir esta columna (unos pocos por petición). */
async function backfillGenres(rows: Row[]) {
  const missing = rows.filter((r) => r.genres == null && r.source === 'tmdb').slice(0, BACKFILL_MAX);
  await Promise.all(missing.map(async (r) => {
    try {
      const d = await detailTmdb(r.external_id);
      const genres = d.genres ?? [];
      run('UPDATE content SET genres = ? WHERE id = ?', [JSON.stringify(genres), r.id]);
      r.genres = JSON.stringify(genres);
    } catch { /* se reintentará en la siguiente petición */ }
  }));
}

const parse = (g: string | null): number[] => { try { const v = JSON.parse(g ?? '[]'); return Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : []; } catch { return []; } };

export async function recommend(userId: number, kind: 'serie' | 'pelicula' | 'anime', page = 1): Promise<Recommendations> {
  const title = kind === 'pelicula' ? 'Películas que has podido ver' : kind === 'anime' ? 'Anime que has podido ver' : 'Series que has podido ver';
  const base = { kind, title, items: [], genres: [], warnings: [] as string[], page, hasMore: false };
  // Jikan no aporta géneros: por ahora no hay recomendaciones de anime
  if (kind === 'anime') return { ...base, reason: 'anime' };
  if (!tmdbAvailable()) return { ...base, reason: 'sin_tmdb' };

  const rows = all<Row>(
    `SELECT c.id, c.source, c.external_id, c.type, c.genres, uc.status, uc.is_favorite
     FROM user_content uc JOIN content c ON c.id = uc.content_id WHERE uc.user_id = ?`,
    [userId],
  );
  await backfillGenres(rows);

  const libItems: LibItem[] = rows
    .filter((r) => r.type === 'serie' || r.type === 'pelicula')
    .map((r) => ({ kind: r.type as Kind, genres: parse(r.genres), status: r.status, favorite: !!r.is_favorite }))
    .filter((i) => i.genres.length > 0);

  const market = await marketShares(kind).catch(() => ({} as Record<number, number>));
  const scores = genreAffinity(libItems, kind, market);
  if (!scores.length) return { ...base, reason: 'sin_datos' };

  const top = scores.slice(0, TOP_GENRES);
  const warnings: string[] = [];
  const lists = await Promise.all(top.map((g) => discoverTmdb(TK[kind], { genres: [g.id], quality: true, page }).catch(() => { warnings.push('TMDB no respondió a una de las consultas de recomendaciones.'); return [] as ProviderItem[]; })));

  const owned = new Set(rows.map((r) => r.external_id));
  const seen = new Set<string>();
  const cands: { index: number; genres: number[]; voteAverage: number | null; popularity: number | null; item: ProviderItem }[] = [];
  let index = 0;
  for (const it of lists.flat()) {
    if (owned.has(it.externalId) || seen.has(it.externalId) || !it.genres?.length) continue;
    seen.add(it.externalId);
    cands.push({ index: index++, genres: it.genres, voteAverage: it.voteAverage ?? null, popularity: it.popularity ?? null, item: it });
  }

  const names = await genreNamesTmdb(TK[kind]).catch(() => ({} as Record<number, string>));
  const aff = new Map(scores.map((s) => [s.id, s.score]));
  const ranked = rankCandidates(cands, scores).slice(0, RESULTS);
  const items = ranked.map((c) => {
    // El género de este título que más pesa en tus gustos es el motivo de la recomendación
    const best = [...c.genres].sort((a, b) => (aff.get(b) ?? 0) - (aff.get(a) ?? 0))[0];
    return { ...toDto(upsertFromProvider(c.item)), why: best != null && aff.has(best) ? names[best] ?? null : null };
  });
  const genres: RecoGenre[] = top.map((g) => ({ id: g.id, name: names[g.id] ?? `Género ${g.id}`, score: +g.score.toFixed(3), lift: +g.lift.toFixed(3), userShare: +g.userShare.toFixed(3), marketShare: +g.marketShare.toFixed(3), weight: +g.weight.toFixed(2) }));
  // Más páginas mientras TMDB siga devolviendo candidatos y no se supere el límite
  const hasMore = page < MAX_RECO_PAGES && lists.some((l) => l.length > 0);
  return { ...base, items, genres, warnings, reason: null, hasMore };
}
