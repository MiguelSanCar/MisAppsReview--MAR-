/**
 * Cambios en la estructura de temporadas de una serie y su efecto en el progreso de cada persona (reglas puras).
 *
 * Solo cuentan los cambios de *temporadas*: una temporada nueva ya estrenada (con episodios) o una que desaparece.
 * Los episodios que una temporada en emisión va sumando semana a semana no alteran la estructura guardada.
 */
import type { ItemState } from './rules';
import type { SeasonInfo } from './news';
import type { Season } from './seasons';

export interface StructureChange {
  /** Estructura resultante (misma serie, con las temporadas nuevas y sin las eliminadas), conservando las duraciones. */
  next: Season[];
  total: number;
  added: number[];
  removed: number[];
}

/**
 * Compara la estructura guardada con las temporadas que ahora publica TMDB. `today` = AAAA-MM-DD.
 *  - Se añade una temporada si no estaba, tiene episodios y su fecha de estreno ya ha pasado.
 *  - Se elimina una temporada guardada que TMDB ya no publica (o publica sin episodios).
 * Devuelve null si no hay cambios o no es seguro decidirlos (sin estructura previa, o resultado vacío).
 */
export function diffStructure(current: Season[] | null, remote: SeasonInfo[], today: string): StructureChange | null {
  if (!current?.length || !remote.length) return null;
  const live = new Map(remote.filter((s) => s.eps > 0).map((s) => [s.n, s]));
  const removed = current.filter((s) => !live.has(s.number)).map((s) => s.number);
  const known = new Set(current.map((s) => s.number));
  const added = [...live.values()].filter((s) => !known.has(s.n) && !!s.air && s.air <= today).map((s) => s.n).sort((a, b) => a - b);
  if (!added.length && !removed.length) return null;
  const next: Season[] = [
    ...current.filter((s) => live.has(s.number)),
    ...added.map((n) => ({ number: n, episodes: live.get(n)!.eps })),
  ].sort((a, b) => a.number - b.number);
  if (!next.length) return null; // la serie se quedaría sin temporadas: más probable un fallo de TMDB que un cambio real
  return { next, total: next.reduce((n, s) => n + s.episodes, 0), added, removed };
}

/** Episodios vistos de cada temporada guardada, suponiendo que se ven seguidos desde el principio. */
export function seenBySeason(seasons: Season[], watched: number): Map<number, number> {
  const out = new Map<number, number>();
  let before = 0;
  for (const s of seasons) {
    out.set(s.number, Math.min(s.episodes, Math.max(0, watched - before)));
    before += s.episodes;
  }
  return out;
}

/**
 * Progreso de una persona (o de una lista conjunta) tras el cambio:
 *  - Los episodios vistos se conservan temporada a temporada: quitar una temporada resta solo los suyos.
 *  - Si hay temporadas nuevas y estaba Finalizado, pasa a «Por ver» hasta que lo cambie a mano.
 *  - Si no quedan episodios por ver (típicamente tras quitar la temporada pendiente), pasa a Finalizado.
 *  - «Dejado» se respeta: nadie pidió retomarlo.
 * `old` es la estructura previa ya ajustada a su total.
 */
export function reconcileProgress(state: ItemState, old: Season[], change: StructureChange): ItemState {
  const seen = seenBySeason(old, state.watched);
  const watched = change.next.reduce((n, s) => n + Math.min(s.episodes, seen.get(s.number) ?? 0), 0);
  if (state.status === 'DEJADO') return { status: state.status, watched };
  if (watched >= change.total && watched > 0) return { status: 'FINALIZADO', watched: change.total };
  if (change.added.length && state.status === 'FINALIZADO') return { status: 'POR_VER', watched };
  return { status: state.status, watched };
}
