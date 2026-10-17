import type { ImportPreview, ImportResult, ImportSource, MalEntry } from './importTypes';

// Servicio de importación desde MyAnimeList: vista previa (plan en memoria con token) y confirmación.
// CONTRATO: el agente de servicio y rutas lo implementa.

/** Calcula el plan sin escribir nada y lo guarda en memoria (un token por persona; TTL 10 min). */
export function previewImport(userId: number, source: ImportSource, malUser: string | null, entries: MalEntry[]): ImportPreview {
  throw new Error('sin implementar');
}

/**
 * Aplica el plan del token (de un solo uso: 404 si no existe o es de otra persona, 410 si ya se usó o caducó).
 * Recalcula la mezcla con el estado actual dentro de una única transacción. Las entradas sin ficha (XML) se
 * completan después en segundo plano.
 */
export function confirmImport(userId: number, token: string): ImportResult {
  throw new Error('sin implementar');
}

/** Espera a que termine la cola de fichas pendientes (tests). */
export async function drainImportFill(): Promise<void> {
  throw new Error('sin implementar');
}

/** Olvida planes y cola (tests). */
export function resetImportState(): void {
  throw new Error('sin implementar');
}
