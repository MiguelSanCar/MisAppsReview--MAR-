import { all, get, run } from './db';
import { config } from './config';
import { applySample, needsRuntimes, planSample } from './domain/runtimes';
import { parseSeasons } from './domain/seasons';
import { seasonRuntimesTmdb, tmdbAvailable } from './providers/tmdb';

/**
 * Duración real de los episodios de las series, en segundo plano. Nada espera a esto: la ficha y el perfil leen lo que
 * ya hay guardado (con la duración fija como respaldo) y las medias aparecen cuando se han calculado.
 *  - Una serie nueva o sin medias se programa con `scheduleRuntimes`; las peticiones a TMDB (una por temporada larga y
 *    pocas más, ver domain/runtimes.ts) pasan por un límite GLOBAL de concurrencia y se cachean 30 días.
 *  - Un fallo no guarda nada y se reintenta pasado un rato; una consulta sin datos guarda 0 para no insistir.
 */

interface Row { id: number; external_id: string; seasons: string | null }

// --- Límite global de peticiones a TMDB (el hueco se traspasa directamente al siguiente en espera) ---
let active = 0;
const waiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= config.runtimeConcurrency) await new Promise<void>((r) => waiters.push(r));
  else active++;
  try {
    return await fn();
  } finally {
    const next = waiters.shift();
    if (next) next();
    else active--;
  }
}

const running = new Map<number, Promise<void>>(); // contenido → relleno en curso
const failedAt = new Map<number, number>(); //       contenido → cuándo falló la última vez
let halted = false;

/** Calcula y guarda las duraciones de una serie. Si TMDB falla no guarda nada. */
async function fill(contentId: number): Promise<void> {
  const row = get<Row>("SELECT id, external_id, seasons FROM content WHERE id = ? AND source = 'tmdb' AND type = 'serie'", [contentId]);
  const seasons = parseSeasons(row?.seasons);
  if (!row || !seasons || !needsRuntimes(seasons)) return;
  const n = config.runtimeSample;
  const plan = planSample(seasons, n, config.runtimeMaxFetch);
  try {
    const own = new Map<number, (number | null)[]>();
    const sharedParts = new Map<number, (number | null)[]>();
    await Promise.all([
      ...plan.own.map(async (num) => { own.set(num, await withSlot(() => seasonRuntimesTmdb(row.external_id, num))); }),
      ...plan.shared.map(async (num) => { sharedParts.set(num, await withSlot(() => seasonRuntimesTmdb(row.external_id, num))); }),
    ]);
    const shared = plan.shared.flatMap((num) => sharedParts.get(num) ?? []);
    const done = applySample(seasons, n, own, shared);
    // La serie pudo cambiar mientras tanto (nuevas temporadas): solo se guarda si la estructura sigue siendo la misma
    const now = get<Row>('SELECT id, external_id, seasons FROM content WHERE id = ?', [contentId]);
    const cur = parseSeasons(now?.seasons);
    if (!cur || cur.length !== seasons.length || cur.some((s, i) => s.number !== seasons[i].number || s.episodes !== seasons[i].episodes)) return;
    run('UPDATE content SET seasons = ? WHERE id = ?', [JSON.stringify(done), contentId]);
    failedAt.delete(contentId);
  } catch {
    failedAt.set(contentId, Date.now());
  }
}

/** Programa el cálculo de una serie en segundo plano (sin esperar). No hace nada si ya está en curso o falló hace poco. */
export function scheduleRuntimes(contentId: number): void {
  if (halted || running.has(contentId) || !config.useRealRuntime || !tmdbAvailable()) return;
  const f = failedAt.get(contentId);
  if (f && Date.now() - f < config.runtimeRetryMs) return;
  const p = fill(contentId).catch(() => {}).finally(() => { running.delete(contentId); });
  running.set(contentId, p);
}

/**
 * Programa las series de una persona que aún no tienen medias (unas pocas por llamada: el resto, en las siguientes
 * visitas a su perfil). Devuelve cuántas ha programado.
 */
export function scheduleRuntimesFor(userId: number): number {
  if (halted || !config.useRealRuntime || !tmdbAvailable()) return 0;
  const rows = all<Row>(
    `SELECT c.id, c.external_id, c.seasons FROM user_content uc JOIN content c ON c.id = uc.content_id
     WHERE uc.user_id = ? AND c.source = 'tmdb' AND c.type = 'serie' AND c.seasons IS NOT NULL AND c.seasons <> '[]'`,
    [userId],
  );
  let n = 0;
  for (const r of rows) {
    if (n >= config.runtimeFillPerProfile) break;
    if (running.has(r.id) || !needsRuntimes(parseSeasons(r.seasons))) continue;
    const f = failedAt.get(r.id);
    if (f && Date.now() - f < config.runtimeRetryMs) continue;
    scheduleRuntimes(r.id);
    n++;
  }
  return n;
}

/** Espera a que terminen los cálculos en curso (pruebas y apagado). */
export async function drainRuntimes(): Promise<void> {
  halted = true;
  while (running.size) await Promise.all([...running.values()]);
}

/** Espera a que terminen los cálculos en curso sin detener nuevos (pruebas). */
export async function runtimesIdle(): Promise<void> {
  while (running.size) await Promise.all([...running.values()]);
}

/** Estado limpio entre pruebas. */
export function resetRuntimeState(): void {
  halted = false;
  running.clear();
  failedAt.clear();
  active = 0;
  waiters.length = 0;
}
