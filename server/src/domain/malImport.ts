import type { FullState, MalEntry, MalStatus, Outcome } from '../importTypes';
import type { Status } from './rules';

// Reglas puras de la importación desde MyAnimeList (sin red ni BD). CONTRATO: el agente de dominio lo implementa.

/**
 * Estado de MAL (API: `on_hold`, `plan_to_watch`…; XML: «On-Hold», «Plan to Watch»…) → MalStatus.
 * Devuelve null si no se reconoce (la entrada se ignora).
 */
export function mapMalStatus(raw: string): MalStatus | null {
  throw new Error('sin implementar');
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
  throw new Error('sin implementar');
}

/** Clave de orden para «lo más avanzado»: [veces terminado, prev + watched, rango de estado]. */
export function rankKey(s: FullState): [number, number, number] {
  throw new Error('sin implementar');
}

/**
 * Se queda lo más avanzado entre lo que ya hay en MAR (`current`, null si no está) y lo importado.
 * Empate → gana MAR ('same'). Copia la tupla entera del ganador.
 */
export function mergeMostAdvanced(current: FullState | null, incoming: FullState): { next: FullState; outcome: Outcome } {
  throw new Error('sin implementar');
}

/**
 * Ajuste por estreno: si no se ha estrenado (o no hay episodios disponibles) solo cabe POR_VER con 0 episodios;
 * si hay menos episodios disponibles (`watchable`) que vistos, se topan. `adjusted` = se ha cambiado algo.
 */
export function gateRelease(s: FullState, release: { unreleased: boolean; watchable: number | null }): { state: FullState; adjusted: boolean } {
  throw new Error('sin implementar');
}

export const STATUS_RANK: Record<Status, number> = { POR_VER: 0, DEJADO: 1, VIENDO: 2, FINALIZADO: 3 };
