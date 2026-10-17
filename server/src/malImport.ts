import crypto from 'crypto';
import { get, transaction } from './db';
import { ContentRow, ensureCore, getContent, toDto, todayIso, upsertFromProvider } from './content';
import { getState, saveFullState, UserState } from './library';
import { HttpError } from './http';
import { knownTotal } from './domain/rules';
import { isFuture } from './domain/release';
import { gateRelease, mergeMostAdvanced, toFullState } from './domain/malImport';
import type { ProviderItem } from './providers/types';
import type { FullState, ImportPreview, ImportResult, ImportSource, ImportSummary, MalEntry, Outcome } from './importTypes';

// Servicio de importación desde MyAnimeList: vista previa (plan en memoria con token) y confirmación.
//  - La vista previa no escribe nada: calcula qué pasaría con cada entrada y guarda el plan en memoria (uno por
//    persona; una vista previa nueva sustituye a la anterior) con un token de un solo uso que caduca a los 10 minutos.
//  - La confirmación vuelve a calcular la mezcla con el estado de ese momento (pudo cambiar entre medias) y lo escribe
//    todo en una única transacción. Las entradas que llegan sin ficha (fichero XML) se completan después, de una en
//    una y en segundo plano.

const PLAN_TTL_MS = 10 * 60_000;
const MAX_PLANS = 500;
const SAMPLE_SIZE = 3;

interface Plan {
  token: string;
  expires: number;
  source: ImportSource;
  malUser: string | null;
  entries: MalEntry[];
  used: boolean;
}

const plans = new Map<number, Plan>(); // persona → plan (orden de inserción = antigüedad)

const toFull = (s: UserState): FullState => ({ status: s.status, watched: s.watched, prev: s.previousEpisodes, rewatch: s.rewatch });

const existingRow = (malId: number) =>
  get<ContentRow>('SELECT * FROM content WHERE source = ? AND external_id = ?', ['mal', String(malId)]);

/** Ítem mínimo para guardar una entrada que llega sin ficha (XML): el resto se completa en segundo plano. */
const minimalItem = (e: MalEntry): ProviderItem => ({
  source: 'mal', externalId: String(e.malId), type: 'anime', title: e.title, posterUrl: null, synopsis: null,
  year: null, totalEpisodes: e.totalEpisodes, runtimeMinutes: null, studio: null,
});

interface Decision {
  next: FullState;
  outcome: Outcome;
  adjusted: boolean;
  current: UserState | undefined;
}

/** Qué pasa con una entrada frente a la fila de contenido (si existe) y el estado actual de la persona. */
function decide(userId: number, entry: MalEntry, row: ContentRow | undefined): Decision {
  const total = knownTotal(row?.total_episodes ?? entry.totalEpisodes);
  const release = row ? toDto(row) : { unreleased: isFuture(entry.item?.releaseDate, todayIso()), watchable: null };
  const gated = gateRelease(toFullState(entry, total), release);
  const current = row ? getState(userId, row.id) : undefined;
  const { next, outcome } = mergeMostAdvanced(current ? toFull(current) : null, gated.state);
  return { next, outcome, adjusted: gated.adjusted, current };
}

/** Una sola entrada por anime (el fichero podría repetir alguno): se queda la primera. */
function uniqueEntries(entries: MalEntry[]): MalEntry[] {
  const seen = new Set<number>();
  return entries.filter((e) => (seen.has(e.malId) ? false : (seen.add(e.malId), true)));
}

function storePlan(userId: number, plan: Plan) {
  const now = Date.now();
  plans.delete(userId); // la nueva vista previa sustituye a la anterior y pasa al final (la más reciente)
  for (const [id, p] of plans) if (p.expires <= now) plans.delete(id);
  plans.set(userId, plan);
  while (plans.size > MAX_PLANS) plans.delete(plans.keys().next().value as number);
}

/** Calcula el plan sin escribir nada y lo guarda en memoria (un token por persona; TTL 10 min). */
export function previewImport(userId: number, source: ImportSource, malUser: string | null, entries: MalEntry[]): ImportPreview {
  const list = uniqueEntries(entries);
  if (!list.length) throw new HttpError(400, 'La lista está vacía');

  const summary: ImportSummary = { add: 0, update: 0, same: 0, adjusted: 0, byType: {} };
  const sample: ImportPreview['sample'] = [];
  for (const entry of list) {
    const d = decide(userId, entry, existingRow(entry.malId));
    summary[d.outcome]++;
    if (d.adjusted) summary.adjusted++;
    const type = entry.mediaType || 'unknown';
    summary.byType[type] = (summary.byType[type] ?? 0) + 1;
    if (d.outcome !== 'same' && sample.length < SAMPLE_SIZE) {
      sample.push({ title: entry.title, outcome: d.outcome, status: d.next.status, watched: d.next.watched });
    }
  }

  const token = crypto.randomBytes(16).toString('hex');
  storePlan(userId, { token, expires: Date.now() + PLAN_TTL_MS, source, malUser, entries: list, used: false });
  return { token, source, malUser, total: list.length, summary, sample };
}

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Fecha ISO con `Z`: la de MAL si es válida y no futura; si no, `fallback`. */
function addedAt(updatedAt: string | null, fallback: number): string {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  return new Date(Number.isFinite(t) ? Math.min(t, Date.now()) : fallback).toISOString();
}

/**
 * Aplica el plan del token (de un solo uso: 404 si no existe o es de otra persona, 410 si ya se usó o caducó).
 * Recalcula la mezcla con el estado actual dentro de una única transacción. Las entradas sin ficha (XML) se
 * completan después en segundo plano.
 */
export function confirmImport(userId: number, token: string): ImportResult {
  const plan = plans.get(userId);
  if (!plan || !sameToken(plan.token, token)) throw new HttpError(404, 'No hay ninguna importación pendiente');
  if (plan.used || plan.expires <= Date.now()) throw new HttpError(410, 'La vista previa ha caducado: vuelve a importar');

  const toFill: number[] = [];
  const result = transaction(() => {
    const r: ImportResult = { added: 0, updated: 0, same: 0, adjusted: 0 };
    const now = Date.now();
    plan.entries.forEach((entry, index) => {
      const row = upsertFromProvider(entry.item ?? minimalItem(entry));
      if (!row.detailed_at && !row.poster_url) toFill.push(row.id);
      const d = decide(userId, entry, row);
      if (d.adjusted) r.adjusted++;
      if (d.outcome === 'same') { r.same++; return; }
      // Alta: la fecha de MAL (para que «Mi lista» conserve el orden); sin ella (XML), el orden del fichero
      const updatedAt = d.outcome === 'add' ? addedAt(entry.updatedAt, now - index) : new Date(now).toISOString();
      saveFullState(userId, row.id, d.next, d.current?.favorite ?? false, updatedAt);
      if (d.outcome === 'add') r.added++;
      else r.updated++;
    });
    return r;
  });
  // Se gasta solo si todo se ha escrito (confirmImport es síncrona: dos confirmaciones no pueden cruzarse)
  plan.used = true;
  enqueueFill(toFill);
  return result;
}

// --- Cola de fichas por completar (entradas del XML): de una en una, sin duplicados ---
const queue: number[] = [];
const queued = new Set<number>();
let pump: Promise<void> | null = null;

async function runQueue() {
  while (queue.length) {
    const id = queue.shift()!;
    try {
      const row = getContent(id);
      if (row) await ensureCore(row);
    } catch {
      /* proveedor caído o anime sin ficha: se omite (se completará al abrir la ficha) */
    } finally {
      queued.delete(id);
    }
  }
}

function enqueueFill(ids: number[]) {
  for (const id of ids) {
    if (queued.has(id)) continue;
    queued.add(id);
    queue.push(id);
  }
  if (!pump && queue.length) pump = runQueue().finally(() => { pump = null; });
}

/** Espera a que termine la cola de fichas pendientes (tests). */
export async function drainImportFill(): Promise<void> {
  while (pump) await pump;
}

/** Olvida planes y cola (tests). */
export function resetImportState(): void {
  plans.clear();
  queue.length = 0;
  queued.clear();
}
