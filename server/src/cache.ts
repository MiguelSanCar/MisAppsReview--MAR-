import { get, run } from './db';

/** Caché persistente de respuestas externas (OMDb gratuito: ~1.000 consultas/día). */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = get<{ value: string; expires_at: number }>('SELECT value, expires_at FROM api_cache WHERE key = ?', [key]);
  if (hit && hit.expires_at > now) return JSON.parse(hit.value) as T;

  try {
    const value = await fetcher();
    run('INSERT OR REPLACE INTO api_cache (key, value, expires_at) VALUES (?, ?, ?)', [
      key,
      JSON.stringify(value),
      now + ttlSeconds * 1000,
    ]);
    return value;
  } catch (e) {
    // Si el proveedor falla, mejor un dato caducado que ningún dato.
    if (hit) return JSON.parse(hit.value) as T;
    throw e;
  }
}

export function purgeExpiredCache() {
  run('DELETE FROM api_cache WHERE expires_at < ?', [Date.now()]);
}

const mem = new Map<string, { exp: number; p: Promise<any> }>();

/**
 * Caché en memoria con deduplicación de peticiones en vuelo (dos llamadas simultáneas con la misma clave
 * comparten una sola petición al proveedor). Para búsquedas "al escribir": no se persiste en la BD
 * (evita escrituras constantes) y los errores no se cachean.
 */
export function memCached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && hit.exp > now) return hit.p;
  const p = fetcher();
  mem.set(key, { exp: now + ttlSeconds * 1000, p });
  p.catch(() => { if (mem.get(key)?.p === p) mem.delete(key); });
  if (mem.size > 500) {
    for (const [k, v] of mem) if (v.exp <= now) mem.delete(k);
    if (mem.size > 500) mem.delete(mem.keys().next().value as string);
  }
  return p;
}
