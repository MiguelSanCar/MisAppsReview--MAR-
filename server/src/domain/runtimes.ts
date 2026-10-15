import type { Season } from './seasons';

/**
 * Duración de los episodios (reglas puras, sin red ni base de datos).
 *
 * Consultar la duración de CADA episodio de una serie larga costaría decenas de peticiones. Se muestrea:
 *  - Temporada «larga» (más de 3N episodios): se piden sus primeros N episodios y la media es la de ESA temporada.
 *  - Temporadas «cortas» (hasta 3N): no se consulta cada una; se toman N episodios (de las primeras temporadas cortas)
 *    y su media vale para TODAS las temporadas cortas de la serie.
 *  - Lo que no se pudo medir usa la media de lo medido y, si no hay nada, la duración fija por tipo.
 * La media de cada temporada se guarda en `Season.minutes` (0 = sin datos).
 */

/** Máximo de temporadas cortas que se consultan para reunir los N episodios de muestra. */
const MAX_SHARED_SEASONS = 3;

export const isLong = (s: Season, n: number) => s.episodes > 3 * n;

export interface SamplePlan {
  /** Temporadas largas que se consultan (cada una aporta su propia media). */
  own: number[];
  /** Temporadas cortas que aportan la muestra común (en orden, hasta reunir N episodios). */
  shared: number[];
}

/** Qué temporadas hay que pedir a TMDB. `maxFetch` limita las peticiones por serie (las largas que sobren usan la media). */
export function planSample(seasons: Season[], n: number, maxFetch: number): SamplePlan {
  const ordered = [...seasons].sort((a, b) => a.number - b.number);
  const own = ordered.filter((s) => isLong(s, n)).map((s) => s.number);
  const shared: number[] = [];
  let have = 0;
  for (const s of ordered) {
    if (isLong(s, n)) continue;
    if (have >= n || shared.length >= MAX_SHARED_SEASONS) break;
    shared.push(s.number);
    have += s.episodes;
  }
  // Las temporadas cortas que aportan la muestra común cuentan para el límite de peticiones
  const room = Math.max(0, maxFetch - shared.length);
  return { own: own.slice(0, room), shared };
}

/** Media redondeada de los primeros `n` valores con duración conocida (> 0); null si no hay ninguno. */
export function averageOf(values: (number | null | undefined)[], n: number): number | null {
  const ok = values.slice(0, n).filter((v): v is number => typeof v === 'number' && v > 0);
  return ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
}

/**
 * Medias por temporada a partir de lo consultado. `own`: duraciones por temporada larga; `shared`: duraciones de los
 * primeros episodios de las temporadas cortas consultadas (ya concatenadas en orden).
 */
export function applySample(seasons: Season[], n: number, own: Map<number, (number | null)[]>, shared: (number | null)[]): Season[] {
  const ownAvg = new Map<number, number>();
  for (const [num, v] of own) {
    const a = averageOf(v, n);
    if (a != null) ownAvg.set(num, a);
  }
  const sharedAvg = averageOf(shared, n);
  const known = [...ownAvg.values(), ...(sharedAvg != null ? [sharedAvg] : [])];
  const overall = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : 0;
  return seasons.map((s) => ({
    ...s,
    minutes: isLong(s, n) ? ownAvg.get(s.number) ?? overall : sharedAvg ?? overall,
  }));
}

/** ¿Alguna temporada aún no tiene su duración calculada? (0 = ya consultado sin datos). */
export const needsRuntimes = (seasons: Season[] | null | undefined) => !!seasons?.length && seasons.some((s) => s.minutes === undefined);

/** ¿Hay duraciones reales utilizables? */
export const hasRuntimes = (seasons: Season[] | null | undefined) => !!seasons?.some((s) => (s.minutes ?? 0) > 0);

/**
 * Minutos de los primeros `count` episodios de una serie: cada temporada aporta su media y, donde no hay dato,
 * `fallback` (duración fija o la media de la serie). Si `count` supera el total de la serie (varios visionados),
 * se vuelve a empezar.
 */
export function minutesOfFirst(seasons: Season[], count: number, fallback: number): number {
  const total = seasons.reduce((n, s) => n + s.episodes, 0);
  if (total <= 0 || count <= 0) return 0;
  const per = (s: Season) => (s.minutes && s.minutes > 0 ? s.minutes : fallback);
  const lap = seasons.reduce((m, s) => m + s.episodes * per(s), 0);
  const laps = Math.floor(count / total);
  let rest = count - laps * total;
  let minutes = laps * lap;
  for (const s of seasons) {
    if (rest <= 0) break;
    const take = Math.min(rest, s.episodes);
    minutes += take * per(s);
    rest -= take;
  }
  return minutes;
}
