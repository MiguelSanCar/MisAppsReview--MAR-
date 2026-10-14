/** Estructura de temporadas de una serie y operaciones sobre ella (reglas puras, sin red ni base de datos). */
export interface Season {
  number: number;
  episodes: number;
}

/** Lee el JSON guardado: null = aún no consultado; [] = consultado y sin temporadas. */
export function parseSeasons(json: string | null | undefined): Season[] | null {
  if (json == null) return null;
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return null;
    return v
      .filter((s) => s && Number.isInteger(s.number) && s.number > 0 && Number.isInteger(s.episodes) && s.episodes > 0)
      .map((s) => ({ number: s.number, episodes: s.episodes }));
  } catch {
    return null;
  }
}

/**
 * Temporadas ordenadas y ajustadas al total de episodios de la serie (que es lo que cuenta el progreso):
 * si TMDB suma de más, se recortan los últimos episodios; si suma de menos, los que faltan se añaden a la última
 * temporada. Devuelve null si no hay estructura utilizable (anime, series sin datos…).
 */
export function normalizeSeasons(seasons: Season[] | null | undefined, total: number | null | undefined): Season[] | null {
  if (!seasons?.length) return null;
  const list = [...seasons].sort((a, b) => a.number - b.number).map((s) => ({ ...s }));
  if (total == null || total <= 0) return list;
  let sum = list.reduce((n, s) => n + s.episodes, 0);
  if (sum < total) {
    list[list.length - 1].episodes += total - sum;
  } else if (sum > total) {
    while (sum > total && list.length) {
      const last = list[list.length - 1];
      const cut = Math.min(last.episodes, sum - total);
      last.episodes -= cut;
      sum -= cut;
      if (last.episodes === 0) list.pop();
    }
  }
  return list.length ? list : null;
}

/** Cuántas temporadas están completas habiendo visto `seen` episodios seguidos desde el principio. */
export function seasonsFinished(seasons: Season[] | null, seen: number): number {
  if (!seasons) return 0;
  let end = 0;
  let n = 0;
  for (const s of seasons) {
    end += s.episodes;
    if (seen >= end) n++;
    else break;
  }
  return n;
}

/** Temporada y episodio (dentro de ella) que ocupa el episodio número `index` (1 = el primero de la serie). */
export function episodeLocation(seasons: Season[], index: number): { season: number; episode: number } | null {
  let before = 0;
  for (const s of seasons) {
    if (index <= before + s.episodes) return { season: s.number, episode: index - before };
    before += s.episodes;
  }
  return null;
}

/**
 * Temporadas vistas de un contenido para las estadísticas. Cuenta las temporadas completas, sumando que en un
 * revisionado ya se vio todo una vez (se usa el mayor entre el visionado actual y los anteriores). Sin estructura
 * (anime, series sin datos), una serie terminada cuenta como una temporada. Las películas no cuentan.
 */
export function seasonsWatchedOf(c: {
  type: string;
  status: string;
  watched: number;
  previous: number;
  seasons: Season[] | null;
}): number {
  if (c.type === 'pelicula') return 0;
  const seen = Math.max(c.watched, c.previous);
  if (c.seasons) return seasonsFinished(c.seasons, seen);
  return c.status === 'FINALIZADO' || c.previous > 0 ? 1 : 0;
}
