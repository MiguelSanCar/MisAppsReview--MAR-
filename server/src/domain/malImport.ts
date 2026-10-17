import type { FullState, MalEntry, MalStatus, Outcome } from '../importTypes';
import { knownTotal } from './rules';
import type { Status } from './rules';

// Reglas puras de la importación desde MyAnimeList (sin red ni BD). CONTRATO: el agente de dominio lo implementa.

/**
 * Estado de MAL (API: `on_hold`, `plan_to_watch`…; XML: «On-Hold», «Plan to Watch»…) → MalStatus.
 * Devuelve null si no se reconoce (la entrada se ignora).
 */
export function mapMalStatus(raw: string): MalStatus | null {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (['watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch'] as const).find((s) => s === key) ?? null;
}

/**
 * Entrada de MAL → estado de MAR. `total` = episodios totales conocidos (null si se desconocen).
 * watching y on_hold → VIENDO; completed → FINALIZADO; dropped → DEJADO; plan_to_watch → POR_VER.
 * Revisionados: completed con t revisiones → FINALIZADO, watched = total, rewatch = t, prev = total·t;
 * rewatching con e episodios → rewatch = t+1, prev = total·(t+1), watched = e, VIENDO (POR_VER si e = 0).
 * Sin total se usa `watched` como total de cada visionado. Normaliza como MAR: watched ≥ total → FINALIZADO;
 * POR_VER con episodios → VIENDO; episodios topados al total.
 */
export function toFullState(entry: MalEntry, total: number | null): FullState {
  const max = knownTotal(total);
  const t = nonNegInt(entry.timesRewatched);
  const w = nonNegInt(entry.watched);
  // Episodios de un visionado completo: el total o, si se desconoce, lo visto.
  const per = max ?? w;
  const capped = max !== null ? Math.min(w, max) : w;

  if (entry.rewatching) {
    // El visionado en curso cuenta como uno más; los anteriores pasan a `prev`.
    const rewatch = t + 1;
    const prev = per * rewatch;
    if (max !== null && w >= max) return { status: 'FINALIZADO', watched: max, prev, rewatch };
    return { status: capped > 0 ? 'VIENDO' : 'POR_VER', watched: capped, prev, rewatch };
  }

  const prev = per * t;
  if (entry.status === 'completed') return { status: 'FINALIZADO', watched: max ?? w, prev, rewatch: t };

  if (max !== null && w >= max) return { status: 'FINALIZADO', watched: max, prev, rewatch: t };
  let status = BASE_STATUS[entry.status];
  if (status === 'POR_VER' && capped > 0) status = 'VIENDO';
  return { status, watched: capped, prev, rewatch: t };
}

const BASE_STATUS: Record<MalStatus, Status> = {
  watching: 'VIENDO',
  on_hold: 'VIENDO',
  completed: 'FINALIZADO',
  dropped: 'DEJADO',
  plan_to_watch: 'POR_VER',
};

/** Entero ≥ 0 (lo que no sea un número finito cuenta como 0). */
const nonNegInt = (n: unknown): number => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Clave de orden para «lo más avanzado»: [veces terminado, prev + watched, rango de estado]. */
export function rankKey(s: FullState): [number, number, number] {
  return [s.rewatch + (s.status === 'FINALIZADO' ? 1 : 0), s.prev + s.watched, STATUS_RANK[s.status]];
}

/**
 * Se queda lo más avanzado entre lo que ya hay en MAR (`current`, null si no está) y lo importado.
 * Empate → gana MAR ('same'). Copia la tupla entera del ganador.
 */
export function mergeMostAdvanced(current: FullState | null, incoming: FullState): { next: FullState; outcome: Outcome } {
  if (!current) return { next: { ...incoming }, outcome: 'add' };
  const a = rankKey(incoming);
  const b = rankKey(current);
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return { next: { ...incoming }, outcome: 'update' };
    if (a[i] < b[i]) break;
  }
  return { next: { ...current }, outcome: 'same' };
}

/**
 * Ajuste por estreno: si no se ha estrenado (o no hay episodios disponibles) solo cabe POR_VER con 0 episodios;
 * si hay menos episodios disponibles (`watchable`) que vistos, se topan. `adjusted` = se ha cambiado algo.
 */
export function gateRelease(s: FullState, release: { unreleased: boolean; watchable: number | null }): { state: FullState; adjusted: boolean } {
  const { unreleased, watchable } = release;
  if (unreleased || watchable === 0) {
    const pristine = s.status === 'POR_VER' && s.watched === 0 && s.prev === 0 && s.rewatch === 0;
    if (pristine) return { state: s, adjusted: false };
    return { state: { status: 'POR_VER', watched: 0, prev: 0, rewatch: 0 }, adjusted: true };
  }
  if (watchable != null && s.watched > watchable) {
    const watched = Math.max(0, watchable);
    return { state: { ...s, status: watched > 0 ? 'VIENDO' : 'POR_VER', watched }, adjusted: true };
  }
  return { state: s, adjusted: false };
}

export const STATUS_RANK: Record<Status, number> = { POR_VER: 0, DEJADO: 1, VIENDO: 2, FINALIZADO: 3 };
