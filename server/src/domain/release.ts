/** Contenidos y temporadas que aún no se han estrenado (reglas puras). Fechas AAAA-MM-DD; `today` también. */
import type { Season } from './seasons';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha válida o null. */
export const cleanDate = (d: unknown): string | null => (typeof d === 'string' && DATE.test(d) ? d : null);

/** ¿Es una fecha futura? Sin fecha se considera ya estrenado (no se bloquea lo que no se sabe). */
export const isFuture = (date: string | null | undefined, today: string): boolean => !!date && date > today;

/** Episodios que ya se pueden ver. Contenido sin estrenar: 0. Con temporadas futuras: solo los de las ya estrenadas. */
export function watchableEpisodes(c: { unreleased: boolean; total: number | null; seasons: Season[] | null }, today: string): number | null {
  if (c.unreleased) return 0;
  if (!c.seasons?.some((s) => isFuture(s.air, today))) return c.total;
  return c.seasons.filter((s) => !isFuture(s.air, today)).reduce((n, s) => n + s.episodes, 0);
}
