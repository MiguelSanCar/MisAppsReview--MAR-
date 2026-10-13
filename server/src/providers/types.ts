import type { ContentType } from '../domain/rules';

export type Source = 'tmdb' | 'jikan';

/** Contenido normalizado, independiente del proveedor. */
export interface ProviderItem {
  source: Source;
  externalId: string;
  type: ContentType;
  title: string;
  posterUrl: string | null;
  synopsis: string | null;
  year: number | null;
  totalEpisodes: number | null;
  runtimeMinutes: number | null;
  studio: string | null;
  imdbId?: string | null;
  malScore?: number | null;
}

export interface Ratings {
  imdb?: string;
  rottenTomatoes?: string;
  mal?: string;
}
