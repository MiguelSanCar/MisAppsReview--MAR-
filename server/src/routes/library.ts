import { Router } from 'express';
import { z } from 'zod';
import { ah, HttpError, parse } from '../http';
import { requireAuth, uid } from './auth';
import {
  ensureRatings, getContent, loadCore, loadContent, search, searchStatus, suggest, toDto, trending, SearchType,
} from '../content';
import {
  applyEpisodes, applyFavorite, applyStatus, CONTENT_TYPES, ItemState, STATUSES,
} from '../domain/rules';
import {
  assertCanFavorite, getState, listLibrary, removeState, saveState,
} from '../library';

export const searchRouter = Router();
export const contentRouter = Router();
export const libraryRouter = Router();

const idParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador no válido');
  return n;
};

// --- Búsqueda ---
searchRouter.get('/status', (_req, res) => res.json(searchStatus()));

const typeParam = (v: unknown): SearchType => {
  const type = String(v ?? "todo") as SearchType;
  if (type !== "todo" && !CONTENT_TYPES.includes(type)) throw new HttpError(400, "Tipo no válido");
  return type;
};

// Sugerencias al escribir (solo títulos, sin tocar la BD).
searchRouter.get(
  "/suggest",
  requireAuth,
  ah(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2 || q.length > 100) return res.json({ suggestions: [], warnings: [] });
    res.json(await suggest(q, typeParam(req.query.type)));
  }),
);

// Pantalla inicial: lo más visto del momento.
searchRouter.get(
  "/trending",
  requireAuth,
  ah(async (req, res) => {
    const t0 = Date.now();
    const out = await trending(typeParam(req.query.type));
    const states: Record<number, ReturnType<typeof getState>> = {};
    for (const r of out.results) states[r.id] = getState(uid(req), r.id);
    res.json({ ...out, states, tookMs: Date.now() - t0 });
  }),
);

searchRouter.get(
  "/",
  requireAuth,
  ah(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) throw new HttpError(400, 'Escribe al menos 2 caracteres');
    if (q.length > 100) throw new HttpError(400, 'Búsqueda demasiado larga');
    const type = typeParam(req.query.type);
    const t0 = Date.now();
    const out = await search(q, type);
    // Estado del usuario sobre cada resultado, para pintar corazón / "más tarde".
    const states: Record<number, ReturnType<typeof getState>> = {};
    for (const r of out.results) states[r.id] = getState(uid(req), r.id);
    res.json({ ...out, states, tookMs: Date.now() - t0 });
  }),
);

// --- Ficha de contenido ---
contentRouter.get(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const id = idParam(req.params.id);
    let row = await loadCore(id);
    row = await ensureRatings(row);
    res.json({ content: toDto(row), state: getState(uid(req), id) ?? null });
  }),
);

// --- Biblioteca personal ---
libraryRouter.use(requireAuth);

libraryRouter.get('/', (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  if (status && !STATUSES.includes(status as any)) throw new HttpError(400, 'Estado no válido');
  const type = req.query.type ? String(req.query.type) : undefined;
  if (type && !CONTENT_TYPES.includes(type as any)) throw new HttpError(400, 'Tipo no válido');
  res.json({
    items: listLibrary(uid(req), {
      status: status as any,
      type,
      favorite: req.query.favorite === '1',
      q: req.query.q ? String(req.query.q).slice(0, 100) : undefined,
    }),
  });
});

const current = (userId: number, contentId: number) => {
  const s = getState(userId, contentId);
  return {
    item: s ? ({ status: s.status, watched: s.watched } as ItemState) : ({ status: 'POR_VER', watched: 0 } as ItemState),
    favorite: s?.favorite ?? false,
    exists: !!s,
  };
};

const reply = (userId: number, contentId: number, res: any) =>
  res.json({ state: getState(userId, contentId) ?? null, totalEpisodes: getContent(contentId)?.total_episodes ?? null });

// Corazón: favorito + visto (máx. 10). Quitar el favorito solo lo saca de favoritos.
libraryRouter.put(
  '/:id/favorite',
  ah(async (req, res) => {
    const id = idParam(req.params.id);
    const { value } = parse(z.object({ value: z.boolean() }), req.body);
    const u = uid(req);
    const cur = current(u, id);
    if (value) {
      if (!cur.favorite) assertCanFavorite(u, false);
      const row = await loadCore(id);
      saveState(u, id, applyFavorite(cur.item, row.total_episodes), true);
    } else if (cur.exists) {
      saveState(u, id, cur.item, false);
    }
    reply(u, id, res);
  }),
);

// Flecha ↪: ver más adelante (alterna).
libraryRouter.put(
  '/:id/later',
  ah(async (req, res) => {
    const id = idParam(req.params.id);
    const { value } = parse(z.object({ value: z.boolean() }), req.body);
    const u = uid(req);
    const cur = current(u, id);
    await loadContent(id);
    if (value) {
      saveState(u, id, { status: 'POR_VER', watched: cur.item.watched }, cur.favorite);
    } else if (cur.exists) {
      if (!cur.favorite && cur.item.watched === 0) {
        removeState(u, id);
      } else {
        const row = await loadCore(id);
        saveState(u, id, applyEpisodes({ ...cur.item, status: 'POR_VER' }, row.total_episodes, cur.item.watched), cur.favorite);
      }
    }
    reply(u, id, res);
  }),
);

libraryRouter.put(
  '/:id/status',
  ah(async (req, res) => {
    const id = idParam(req.params.id);
    const { status } = parse(z.object({ status: z.enum(STATUSES, { errorMap: () => ({ message: 'Estado no válido' }) }) }), req.body);
    const u = uid(req);
    const row = await loadCore(id);
    const cur = current(u, id);
    saveState(u, id, applyStatus(cur.item, row.total_episodes, status), cur.favorite);
    reply(u, id, res);
  }),
);

libraryRouter.put(
  '/:id/episodes',
  ah(async (req, res) => {
    const id = idParam(req.params.id);
    const { watched } = parse(
      z.object({ watched: z.number({ invalid_type_error: 'Solo se aceptan números' }).int('Solo números enteros').min(0, 'No puede ser negativo').max(1_000_000, 'Número demasiado grande') }),
      req.body,
    );
    const u = uid(req);
    const row = await loadCore(id);
    const cur = current(u, id);
    saveState(u, id, applyEpisodes(cur.item, row.total_episodes, watched), cur.favorite);
    reply(u, id, res);
  }),
);

libraryRouter.delete('/:id', (req, res) => {
  removeState(uid(req), idParam(req.params.id));
  res.json({ ok: true });
});

