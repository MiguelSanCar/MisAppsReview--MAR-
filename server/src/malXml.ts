import type { MalEntry } from './importTypes';

// Lector del fichero de exportación de MyAnimeList (myanimelist.net/panel.php?go=export): .xml o .xml.gz.
// CONTRATO: el agente del XML lo implementa.

export const MAL_EXPORT_MAX_ENTRIES = 10_000;
export const MAL_EXPORT_MAX_XML_BYTES = 20 * 1024 * 1024;

/**
 * Convierte el fichero (gzip detectado por los bytes 1f 8b) en entradas. Lanza HttpError(400) con un mensaje claro
 * si no es una exportación de anime de MAL, está dañado, supera el tamaño descomprimido o el máximo de entradas.
 * Las entradas del XML llevan `item: null` y `updatedAt: null`.
 */
export function parseMalExport(buf: Buffer): { malUser: string | null; entries: MalEntry[] } {
  throw new Error('sin implementar');
}
