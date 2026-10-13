import { config } from '../config';
import { cached } from '../cache';
import { getJson } from '../http';
import type { Ratings } from './types';

export const omdbAvailable = () => !!config.omdbKey;

/** IMDb y Rotten Tomatoes (Tomatometer) en una sola petición. RT puede no venir. */
export async function ratingsByImdbId(imdbId: string): Promise<Ratings> {
  const data = await cached(`omdb:${imdbId}`, 7 * 86400, () =>
    getJson<any>(`${config.omdbBase}/?${new URLSearchParams({ i: imdbId, apikey: config.omdbKey })}`, {
      timeoutMs: config.providerTimeoutMs,
    }),
  );
  const out: Ratings = {};
  if (data.Response === 'False') return out;
  if (data.imdbRating && data.imdbRating !== 'N/A') out.imdb = `${data.imdbRating}/10`;
  for (const r of data.Ratings ?? []) {
    if (r.Source === 'Rotten Tomatoes' && r.Value) out.rottenTomatoes = r.Value;
    if (r.Source === 'Internet Movie Database' && !out.imdb && r.Value) out.imdb = r.Value;
  }
  return out;
}
