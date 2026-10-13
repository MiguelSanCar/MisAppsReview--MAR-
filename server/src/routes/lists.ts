import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { all, get, run, transaction } from '../db';
import { ContentRow, getContent, loadCore, toDto } from '../content';
import { applyEpisodes, applyStatus, ItemState, STATUSES } from '../domain/rules';
import { ah, HttpError, parse } from '../http';
import { inactivityInfo } from '../listLife';
import { getUser, getUserByName, publicUser } from '../users';
import { requireAuth, uid } from './auth';
import { areFriends } from './friends';

export const listsRouter = Router();
listsRouter.use(requireAuth);

type Snapshot = ItemState | null;

interface ListRow {
  id: number; name: string; created_by: number; created_at: string;
  user_a: number; user_b: number; last_activity_at: string | null;
}
interface ItemRow { list_id: number; content_id: number; status: ItemState['status']; watched_episodes: number }
interface HistoryRow {
  id: number; list_id: number; content_id: number; user_id: number; action: string;
  before_state: string | null; after_state: string | null; created_at: string;
}

const nowIso = () => new Date().toISOString();
const pair = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

const num = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador no válido');
  return n;
};

/** Lista a la que la persona pertenece AHORA (si ha salido, no tiene acceso a sus contenidos). */
function memberList(req: any): ListRow {
  const id = num(req.params.id);
  const list = get<ListRow>(
    `SELECT l.* FROM joint_lists l JOIN joint_list_members m ON m.list_id = l.id
     WHERE l.id = ? AND m.user_id = ? AND m.left_at IS NULL`,
    [id, uid(req)],
  );
  if (!list) throw new HttpError(404, 'Lista no encontrada');
  return list;
}

/** Cualquier actividad pospone el borrado por inactividad. */
const touch = (listId: number) => run('UPDATE joint_lists SET last_activity_at = ? WHERE id = ?', [nowIso(), listId]);

const members = (listId: number) =>
  all<any>(
    'SELECT u.*, m.left_at FROM joint_list_members m JOIN users u ON u.id = m.user_id WHERE m.list_id = ? ORDER BY u.username',
    [listId],
  ).map((u) => ({ ...publicUser(u), left: !!u.left_at }));

const myStatus = (listId: number, userId: number): 'active' | 'left' | 'none' => {
  const m = get<{ left_at: string | null }>('SELECT left_at FROM joint_list_members WHERE list_id = ? AND user_id = ?', [listId, userId]);
  return !m ? 'none' : m.left_at ? 'left' : 'active';
};

const summary = (l: ListRow, me: number) => ({
  id: l.id,
  name: l.name,
  createdBy: l.created_by,
  items: get<{ n: number }>('SELECT COUNT(*) AS n FROM joint_list_items WHERE list_id = ?', [l.id])!.n,
  members: members(l.id),
  myStatus: myStatus(l.id, me),
  inactivity: inactivityInfo(l.last_activity_at ?? l.created_at),
});

const getItem = (listId: number, contentId: number) =>
  get<ItemRow>('SELECT * FROM joint_list_items WHERE list_id = ? AND content_id = ?', [listId, contentId]);

const snap = (i?: ItemRow): Snapshot => (i ? { status: i.status, watched: i.watched_episodes } : null);

function putItem(listId: number, contentId: number, s: Snapshot) {
  if (!s) return run('DELETE FROM joint_list_items WHERE list_id = ? AND content_id = ?', [listId, contentId]);
  run(
    `INSERT INTO joint_list_items (list_id, content_id, status, watched_episodes) VALUES (?, ?, ?, ?)
     ON CONFLICT(list_id, content_id) DO UPDATE SET status = excluded.status, watched_episodes = excluded.watched_episodes`,
    [listId, contentId, s.status, s.watched],
  );
}

/** Guarda la modificación en el historial, recorta a las últimas N entradas y marca actividad en la lista. */
function record(listId: number, contentId: number, userId: number, action: string, before: Snapshot, after: Snapshot) {
  run(
    'INSERT INTO joint_list_history (list_id, content_id, user_id, action, before_state, after_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [listId, contentId, userId, action, before && JSON.stringify(before), after && JSON.stringify(after), nowIso()],
  );
  run(
    `DELETE FROM joint_list_history WHERE list_id = ? AND id NOT IN
       (SELECT id FROM joint_list_history WHERE list_id = ? ORDER BY id DESC LIMIT ?)`,
    [listId, listId, config.jointHistoryLimit],
  );
  touch(listId);
}

const itemDto = (c: ContentRow, i: ItemRow) => ({ ...toDto(c), state: { status: i.status, watched: i.watched_episodes } });

function listItems(listId: number) {
  return all<ContentRow & ItemRow>(
    'SELECT c.*, i.status, i.watched_episodes, i.list_id, i.content_id FROM joint_list_items i JOIN content c ON c.id = i.content_id WHERE i.list_id = ? ORDER BY c.title COLLATE NOCASE',
    [listId],
  ).map((r) => itemDto(r, r));
}

function historyDto(h: HistoryRow & { username: string }) {
  return {
    id: h.id, contentId: h.content_id, user: h.username, action: h.action, createdAt: h.created_at,
    before: h.before_state ? JSON.parse(h.before_state) : null,
    after: h.after_state ? JSON.parse(h.after_state) : null,
  };
}

const historyOf = (listId: number, contentId?: number) =>
  all<HistoryRow & { username: string; title: string }>(
    `SELECT h.*, u.username, c.title FROM joint_list_history h
     JOIN users u ON u.id = h.user_id JOIN content c ON c.id = h.content_id
     WHERE h.list_id = ? ${contentId ? 'AND h.content_id = ?' : ''} ORDER BY h.id DESC`,
    contentId ? [listId, contentId] : [listId],
  ).map((h) => ({ ...historyDto(h), title: h.title }));

const pairLists = (a: number, b: number) =>
  all<ListRow>('SELECT * FROM joint_lists WHERE user_a = ? AND user_b = ? ORDER BY id', pair(a, b));

// --- Listas ---
listsRouter.get('/', (req, res) => {
  const me = uid(req);
  const rows = all<ListRow & { left_at: string | null }>(
    `SELECT l.*, m.left_at FROM joint_lists l JOIN joint_list_members m ON m.list_id = l.id
     WHERE m.user_id = ? ORDER BY l.id DESC`,
    [me],
  );
  res.json({
    lists: rows.filter((l) => !l.left_at).map((l) => summary(l, me)),
    // Listas que dejaste: se conservan (hasta el borrado por inactividad) y puedes volver a unirte.
    left: rows.filter((l) => l.left_at).map((l) => summary(l, me)),
  });
});

/** «Vuestra lista»: la lista conjunta de la pareja formada por ti y un amigo (o null si aún no existe). */
listsRouter.get('/with/:username', (req, res) => {
  const me = uid(req);
  const friend = getUserByName(req.params.username);
  if (!friend) throw new HttpError(404, 'Este perfil no existe');
  if (friend.id === me) throw new HttpError(400, 'Elige a otra persona');
  if (!areFriends(me, friend.id)) throw new HttpError(403, 'Solo puedes tener listas conjuntas con tus amigos');
  const list = pairLists(me, friend.id)[0];
  res.json({ friend: publicUser(friend), list: list ? summary(list, me) : null, maxLists: config.maxListsPerPair });
});

listsRouter.post('/', (req, res) => {
  const { name, friendId } = parse(
    z.object({
      name: z.string().trim().max(40, 'Nombre demasiado largo').optional(),
      friendId: z.number().int(),
    }),
    req.body,
  );
  const me = uid(req);
  const friend = getUser(friendId);
  if (!friend || !areFriends(me, friendId)) throw new HttpError(400, 'Solo puedes crear listas con tus amigos');
  // Cualquiera de los dos puede crearla sin permiso de la otra persona, pero por ahora solo una por pareja.
  if (pairLists(me, friendId).length >= config.maxListsPerPair) throw new HttpError(409, 'Ya tenéis una lista conjunta');
  const finalName = name || `Lista de ${getUser(me)!.username} y ${friend.username}`;
  const [a, b] = pair(me, friendId);
  const id = transaction(() => {
    const { lastId } = run(
      'INSERT INTO joint_lists (name, created_by, created_at, user_a, user_b, last_activity_at) VALUES (?, ?, ?, ?, ?, ?)',
      [finalName, me, nowIso(), a, b, nowIso()],
    );
    run('INSERT INTO joint_list_members (list_id, user_id) VALUES (?, ?)', [lastId, me]);
    run('INSERT INTO joint_list_members (list_id, user_id) VALUES (?, ?)', [lastId, friendId]);
    return lastId;
  });
  res.status(201).json({ id });
});

listsRouter.get('/:id', (req, res) => {
  const list = memberList(req);
  res.json({
    list: { ...summary(list, uid(req)), members: members(list.id) },
    items: listItems(list.id),
    historyLimit: config.jointHistoryLimit,
  });
});

listsRouter.delete('/:id', (req, res) => {
  const list = memberList(req);
  if (list.created_by !== uid(req)) throw new HttpError(403, 'Solo quien creó la lista puede borrarla');
  run('DELETE FROM joint_lists WHERE id = ?', [list.id]);
  res.json({ ok: true });
});

/** Salir de la lista: NO se borra; la otra persona sigue teniéndola y tú puedes volver a unirte. */
listsRouter.post('/:id/leave', (req, res) => {
  const list = memberList(req);
  transaction(() => {
    run('UPDATE joint_list_members SET left_at = ? WHERE list_id = ? AND user_id = ?', [nowIso(), list.id, uid(req)]);
    touch(list.id);
  });
  res.json({ ok: true });
});

/** Volver a unirse a una lista que dejaste (mientras siga existiendo y seáis amigos). */
listsRouter.post('/:id/join', (req, res) => {
  const me = uid(req);
  const id = num(req.params.id);
  const list = get<ListRow>('SELECT * FROM joint_lists WHERE id = ?', [id]);
  const status = list ? myStatus(id, me) : 'none';
  if (!list || status === 'none') throw new HttpError(404, 'Lista no encontrada');
  if (status === 'active') return res.json({ ok: true });
  const partner = list.user_a === me ? list.user_b : list.user_a;
  if (!areFriends(me, partner)) throw new HttpError(403, 'Solo puedes volver a una lista compartida con un amigo');
  transaction(() => {
    run('UPDATE joint_list_members SET left_at = NULL WHERE list_id = ? AND user_id = ?', [id, me]);
    touch(id);
  });
  res.json({ ok: true });
});

listsRouter.get('/:id/history', (req, res) => res.json({ history: historyOf(memberList(req).id) }));

// --- Contenidos de la lista (cualquiera de las dos personas puede modificarlos) ---
listsRouter.post('/:id/items', (req, res) => {
  const list = memberList(req);
  const { contentId } = parse(z.object({ contentId: z.number().int().positive() }), req.body);
  if (!getContent(contentId)) throw new HttpError(404, 'Contenido no encontrado');
  if (getItem(list.id, contentId)) throw new HttpError(409, 'Ese contenido ya está en la lista');
  const after: Snapshot = { status: 'POR_VER', watched: 0 };
  transaction(() => {
    putItem(list.id, contentId, after);
    record(list.id, contentId, uid(req), 'add', null, after);
  });
  res.status(201).json({ ok: true });
});

listsRouter.put(
  '/:id/items/:contentId',
  ah(async (req, res) => {
    const list = memberList(req);
    const contentId = num(req.params.contentId);
    const body = parse(
      z.object({
        status: z.enum(STATUSES, { errorMap: () => ({ message: 'Estado no válido' }) }).optional(),
        watched: z.number({ invalid_type_error: 'Solo se aceptan números' }).int('Solo números enteros').min(0).max(1_000_000).optional(),
      }).refine((b) => b.status !== undefined || b.watched !== undefined, 'Nada que modificar'),
      req.body,
    );
    const item = getItem(list.id, contentId);
    if (!item) throw new HttpError(404, 'Ese contenido no está en la lista');
    const total = (await loadCore(contentId)).total_episodes;
    const before = snap(item)!;
    const after =
      body.watched !== undefined
        ? applyEpisodes(before, total, body.watched)
        : applyStatus(before, total, body.status!);
    if (after.status !== before.status || after.watched !== before.watched) {
      transaction(() => {
        putItem(list.id, contentId, after);
        record(list.id, contentId, uid(req), body.watched !== undefined ? 'episodes' : 'status', before, after);
      });
    }
    res.json({ state: after, totalEpisodes: total });
  }),
);

listsRouter.delete('/:id/items/:contentId', (req, res) => {
  const list = memberList(req);
  const contentId = num(req.params.contentId);
  const item = getItem(list.id, contentId);
  if (!item) throw new HttpError(404, 'Ese contenido no está en la lista');
  transaction(() => {
    putItem(list.id, contentId, null);
    record(list.id, contentId, uid(req), 'remove', snap(item), null);
  });
  res.json({ ok: true });
});

// --- Historial y rollback de un contenido ---
listsRouter.get('/:id/items/:contentId/history', (req, res) => {
  const list = memberList(req);
  res.json({ history: historyOf(list.id, num(req.params.contentId)), historyLimit: config.jointHistoryLimit });
});

listsRouter.post('/:id/items/:contentId/rollback', (req, res) => {
  const list = memberList(req);
  const contentId = num(req.params.contentId);
  const { historyId } = parse(z.object({ historyId: z.number().int().positive() }), req.body);
  const entry = get<HistoryRow>('SELECT * FROM joint_list_history WHERE id = ? AND list_id = ? AND content_id = ?', [historyId, list.id, contentId]);
  if (!entry) throw new HttpError(404, 'Esa entrada del historial ya no existe');
  // "Volver a ese punto": el contenido queda como estaba justo tras esa modificación.
  const target: Snapshot = entry.after_state ? JSON.parse(entry.after_state) : null;
  const before = snap(getItem(list.id, contentId));
  transaction(() => {
    putItem(list.id, contentId, target);
    record(list.id, contentId, uid(req), 'rollback', before, target);
  });
  res.json({ state: target });
});
