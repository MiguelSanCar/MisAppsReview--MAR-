import { config } from '../config';
import { cached, memCached } from '../cache';
import { getJson, guarded, HttpError } from '../http';
import type { ProviderItem } from './types';

// Jikan (API no oficial de MyAnimeList) limita a ~3 peticiones/segundo: se serializan con un hueco mínimo.
let chain: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => new Promise((r) => setTimeout(r, config.jikanMinGapMs)),
    () => new Promise((r) => setTimeout(r, config.jikanMinGapMs)),
  );
  return run;
}

const call = (pathname: string, params: Record<string, string> = {}) =>
  guarded(`jikan|${config.jikanBase}`, config.providerDownMs, () =>
    throttled(() =>
      getJson<any>(`${config.jikanBase}${pathname}?${new URLSearchParams(params)}`, { timeoutMs: config.jikanTimeoutMs }),
    ),
  );

function parseMinutes(d?: string | null): number | null {
  // "24 min per ep", "1 hr 55 min"
  if (!d) return null;
  const h = /(\d+)\s*hr/.exec(d);
  const m = /(\d+)\s*min/.exec(d);
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return total > 0 ? total : null;
}

function map(a: any): ProviderItem {
  const isMovie = a.type === 'Movie';
  const total = isMovie ? 1 : a.episodes > 0 ? a.episodes : null;
  return {
    source: 'jikan',
    externalId: String(a.mal_id),
    type: 'anime',
    title: a.title_english || a.title || 'Sin título',
    posterUrl: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
    synopsis: a.synopsis || null,
    year: a.year ?? (a.aired?.prop?.from?.year || null),
    totalEpisodes: total,
    runtimeMinutes: parseMinutes(a.duration),
    studio: (a.studios ?? []).map((s: any) => s.name).join(' · ') || null,
    malScore: typeof a.score === 'number' ? a.score : null,
    popularity: typeof a.members === 'number' ? a.members / 3000 : null,
  };
}

export async function searchJikan(query: string): Promise<ProviderItem[]> {
  const data = await memCached(`jikan:search:${query.toLowerCase()}`, 600, () =>
    call('/anime', { q: query, limit: '20', sfw: 'true' }),
  );
  return (data.data ?? []).map(map);
}

/** Anime más vistos ahora mismo (emisión). */
export async function trendingJikan(): Promise<ProviderItem[]> {
  const data = await memCached("jikan:trending", 3600, () => call("/top/anime", { filter: "airing", limit: "20", sfw: "true" }));
  return (data.data ?? []).map(map);
}

export async function detailJikan(externalId: string): Promise<ProviderItem> {
  if (!/^\d+$/.test(externalId)) throw new HttpError(400, 'Identificador MAL no válido');
  const data = await cached(`jikan:detail:${externalId}`, 7 * 86400, () => call(`/anime/${externalId}`));
  return map(data.data);
}
