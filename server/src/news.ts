import { all, get, run, transaction } from './db';
import { config } from './config';
import { upsertFromProvider } from './content';
import { baseOf, diffNews, isDue, parseBase, parseSnap, Snap, TvSnap } from './domain/news';
import { movieItemFromRel, newsMovie, newsTv, tmdbAvailable } from './providers/tmdb';

/**
 * Motor de novedades. Principios para no perjudicar al resto de la aplicación:
 *  - Las peticiones de la campana solo leen de la base de datos: **nunca esperan a TMDB**.
 *  - El cálculo va en segundo plano, en rondas pequeñas (`newsBudget` contenidos), con un límite GLOBAL de peticiones
 *    simultáneas a TMDB (`newsConcurrency`) y cediendo el turno al resto de peticiones entre contenido y contenido.
 *  - Cada contenido se consulta cuando toca según su tipo (series en emisión 12 h; terminadas y películas 7 días) y su
 *    instantánea se comparte entre todas las personas que lo tienen; un fallo se reintenta pasado un rato.
 *  - Se fija una «base» por contenido y persona la primera vez: lo que ya existía no genera avisos.
 */

interface Row {
  content_id: number;
  external_id: string;
  type: string;
  title: string;
  news: string | null;
  news_at: string | null;
  news_base: string | null;
  is_favorite: number;
  status: string;
}

const MAX_ROUNDS = 40;
const KEEP_PER_USER = 200;
const ttl = () => ({ activeMs: config.newsTtlActiveMs, idleMs: config.newsTtlIdleMs });
const tick = () => new Promise<void>((r) => setImmediate(r));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// --- Límite global de peticiones a TMDB ---
let active = 0;
const waiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  // Si no hay hueco se espera en la cola; al liberarse, el hueco se TRASPASA directamente al siguiente (sin pasar por
  // «libre»), para que ninguna petición nueva se cuele entre medias y se supere el límite.
  if (active >= config.newsConcurrency) await new Promise<void>((r) => waiters.push(r));
  else active++;
  try {
    return await fn();
  } finally {
    const next = waiters.shift();
    if (next) next();
    else active--;
  }
}

const fetching = new Map<number, Promise<void>>(); // contenido → consulta en curso (se comparte entre personas)
const failedAt = new Map<number, number>(); //          contenido → cuándo falló la última vez
const userRuns = new Map<number, Promise<void>>(); //   persona → refresco en curso
const pendingRounds = new Set<number>(); //             personas con una ronda programada
const roundTimers = new Map<number, ReturnType<typeof setTimeout>>();
let halted = false; //                                    true = no se programa nada más (apagado y pruebas)

const rowsOf = (userId: number) =>
  all<Row>(
    `SELECT c.id AS content_id, c.external_id, c.type, c.title, c.news, c.news_at, uc.news_base, uc.is_favorite, uc.status
     FROM user_content uc JOIN content c ON c.id = uc.content_id
     WHERE uc.user_id = ? AND c.source = 'tmdb' AND c.type IN ('serie', 'pelicula')`,
    [userId],
  );

/** Prioridad: lo que nunca se ha consultado, luego favoritos y lo que se está viendo, luego lo más antiguo. */
const rank = (r: Row) => (r.news_at ? 1 : 0) * 100 + (r.is_favorite ? 0 : 10) + (r.status === 'VIENDO' ? 0 : r.status === 'POR_VER' ? 2 : 5);

function fetchOne(r: Row): Promise<void> {
  const running = fetching.get(r.content_id);
  if (running) return running;
  const p = withSlot(async () => {
    try {
      const prev = parseSnap(r.news);
      const snap: Snap = r.type === 'serie'
        ? await newsTv(r.external_id, prev?.kind === 'tv' ? (prev as TvSnap) : null, config.newsRelatedTtlMs)
        : await newsMovie(r.external_id);
      run('UPDATE content SET news = ?, news_at = ? WHERE id = ?', [JSON.stringify(snap), new Date().toISOString(), r.content_id]);
      failedAt.delete(r.content_id);
    } catch (e) {
      if (process.env.NEWS_DEBUG) console.error('[novedades] falló', r.external_id, (e as Error).message);
      failedAt.set(r.content_id, Date.now());
    }
    await tick(); // cede el turno a las demás peticiones antes de seguir
  }).finally(() => fetching.delete(r.content_id));
  fetching.set(r.content_id, p);
  return p;
}

/** Compara lo guardado con la base de cada contenido y crea los avisos nuevos. Todo en memoria y en una transacción. */
export function evaluateNews(userId: number): number {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  let created = 0;
  transaction(() => {
    for (const r of rowsOf(userId)) {
      const snap = parseSnap(r.news);
      if (!snap) continue;
      const base = parseBase(r.news_base);
      if (!base) {
        // Primera vez: se fija lo que ya existe y no se avisa de nada
        run('UPDATE user_content SET news_base = ? WHERE user_id = ? AND content_id = ?', [JSON.stringify(baseOf(snap)), userId, r.content_id]);
        continue;
      }
      for (const ev of diffNews(base, snap, today)) {
        const relatedId = ev.movie ? upsertFromProvider(movieItemFromRel(ev.movie)).id : null;
        const { changes } = run(
          `INSERT OR IGNORE INTO notifications (user_id, content_id, kind, dedupe_key, season, air_date, related_content_id, related_title, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, r.content_id, ev.kind, ev.key, ev.season ?? null, ev.airDate ?? null, relatedId, ev.movie?.title ?? null, now],
        );
        created += changes;
      }
    }
    // Se conservan los últimos avisos (el resto es historial que nadie va a mirar)
    run('DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)', [userId, userId, KEEP_PER_USER]);
  });
  return created;
}

async function refreshUser(userId: number, round = 1): Promise<void> {
  if (halted) return;
  const now = Date.now();
  const due = rowsOf(userId)
    .filter((r) => isDue(parseSnap(r.news), r.news_at ? Date.parse(r.news_at) : null, now, ttl()))
    .filter((r) => now - (failedAt.get(r.content_id) ?? 0) >= config.newsRetryMs)
    .sort((a, b) => rank(a) - rank(b) || (a.news_at ?? '').localeCompare(b.news_at ?? ''));
  const batch = due.slice(0, config.newsBudget);
  await Promise.all(batch.map(fetchOne));
  evaluateNews(userId);
  // Si quedan contenidos por consultar, otra ronda más tarde (sin acaparar la conexión con TMDB)
  if (due.length > batch.length && round < MAX_ROUNDS && !halted) {
    pendingRounds.add(userId);
    roundTimers.set(userId, setTimeout(() => {
      pendingRounds.delete(userId);
      roundTimers.delete(userId);
      const p = refreshUser(userId, round + 1).catch(() => {}).finally(() => userRuns.delete(userId));
      userRuns.set(userId, p);
    }, config.newsRoundDelayMs));
  }
}

/** Detiene el motor y espera a lo que esté en marcha (al apagar el servidor y al cerrar cada aplicación de pruebas). */
export async function drainNews() {
  halted = true;
  for (const t of roundTimers.values()) clearTimeout(t);
  roundTimers.clear();
  pendingRounds.clear();
  while (fetching.size || userRuns.size) await Promise.allSettled([...fetching.values(), ...userRuns.values()]);
}

/** Olvida el estado interno (colas, fallos recientes). Solo para pruebas: cada aplicación de pruebas parte de cero. */
export function resetNewsState() {
  halted = false;
  failedAt.clear();
  fetching.clear();
  userRuns.clear();
  pendingRounds.clear();
  active = 0;
  waiters.length = 0;
}

/** ¿Hay un cálculo en marcha (o programado) para esta persona? */
export const isChecking = (userId: number) => userRuns.has(userId) || pendingRounds.has(userId);

/**
 * Programa un refresco en segundo plano si toca (como mucho uno cada `newsUserIntervalMs` por persona) y vuelve al
 * instante. Devuelve si hay un cálculo en marcha, para que el cliente vuelva a preguntar poco después.
 */
export function requestNewsRefresh(userId: number): boolean {
  if (!tmdbAvailable()) return false;
  if (isChecking(userId)) return true;
  const u = get<{ news_checked_at: string | null }>('SELECT news_checked_at FROM users WHERE id = ?', [userId]);
  if (!u) return false;
  if (u.news_checked_at && Date.now() - Date.parse(u.news_checked_at) < config.newsUserIntervalMs) return false;
  run('UPDATE users SET news_checked_at = ? WHERE id = ?', [new Date().toISOString(), userId]);
  const p = refreshUser(userId).catch(() => {}).finally(() => { if (!pendingRounds.has(userId)) userRuns.delete(userId); });
  userRuns.set(userId, p);
  return true;
}

/** Espera a que termine todo el cálculo de una persona (para pruebas). */
export async function newsIdle(userId: number, maxMs = 20_000): Promise<void> {
  const t0 = Date.now();
  while (isChecking(userId) && Date.now() - t0 < maxMs) await sleep(5);
}
