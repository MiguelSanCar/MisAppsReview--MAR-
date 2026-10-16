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
  /** Estreno (AAAA-MM-DD): de la película o del primer episodio de la serie. */
  releaseDate?: string | null;
  imdbId?: string | null;
  malScore?: number | null;
  /** Ids de género de TMDB (series y películas; Jikan no los aporta). */
  genres?: number[];
  /** Temporadas de una serie de TMDB (sin la 0, que son especiales). */
  seasons?: { number: number; episodes: number; air?: string }[];
  /** Nota media de TMDB (0-10) en resultados de descubrimiento. */
  voteAverage?: number | null;
  /** Popularidad (escala de TMDB; en anime, miembros de MyAnimeList ÷ 3000) para ordenar resultados. */
  popularity?: number | null;
}

export interface Ratings {
  imdb?: string;
  rottenTomatoes?: string;
  mal?: string;
}
