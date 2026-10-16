import { all, get, run } from './db';
import { config } from './config';
import { ContentDto, ContentRow, toDto } from './content';
import { HttpError } from './http';
import { ItemState, Status } from './domain/rules';

export interface UserContentRow extends ContentRow {
  status: Status;
  watched_episodes: number;
  is_favorite: number;
  updated_at: string;
  prev_episodes: number;
  rewatch: number;
}

/**
 * Comprueba que un cambio es posible según lo estrenado y devuelve el total «efectivo» (los episodios que ya se pueden
 * marcar; un Finalizado manual llega hasta ahí). Lo que no ha salido solo admite «Por ver»; en una serie con temporadas
 * por estrenar no se pueden marcar episodios de ellas.
 */
export function releaseGate(row: ContentRow, change: { status?: Status; watched?: number; favorite?: boolean }): number | null {
  const { unreleased, watchable } = toDto(row);
  if (unreleased || watchable === 0) {
    if ((change.status && change.status !== 'POR_VER') || change.favorite || (change.watched ?? 0) > 0) {
      throw new HttpError(409, 'Todavía no se ha estrenado: de momento solo puedes dejarlo en «Por ver».');
    }
  }
  const total = row.total_episodes;
  if (watchable != null && total != null && watchable < total && (change.watched ?? 0) > watchable) {
    throw new HttpError(409, `Esos episodios todavía no se han estrenado: ahora hay ${watchable} disponibles.`);
  }
  return watchable ?? total;
}

export interface UserState {
  status: Status;
  /** Episodios vistos en el visionado actual. */
  watched: number;
  favorite: boolean;
  updatedAt: string;
  /** Veces que se ha vuelto a ver (>0: mientras no esté Finalizado se muestra «Reviendo»). */
  rewatch: number;
  /** Episodios de visionados anteriores: no se ven en la ficha pero cuentan en las estadísticas. */
  previousEpisodes: number;
}

export interface LibraryItem extends ContentDto {
  state: UserState;
}

export const toState = (r: { status: Status; watched_episodes: number; is_favorite: number; updated_at: string; prev_episodes?: number; rewatch?: number }): UserState => ({
  status: r.status,
  watched: r.watched_episodes,
  favorite: !!r.is_favorite,
  updatedAt: r.updated_at,
  rewatch: r.rewatch ?? 0,
  previousEpisodes: r.prev_episodes ?? 0,
});

export const toItem = (r: UserContentRow): LibraryItem => ({ ...toDto(r), state: toState(r) });

export function getState(userId: number, contentId: number): UserState | undefined {
  const r = get<{ status: Status; watched_episodes: number; is_favorite: number; updated_at: string; prev_episodes: number; rewatch: number }>(
    'SELECT status, watched_episodes, is_favorite, updated_at, prev_episodes, rewatch FROM user_content WHERE user_id = ? AND content_id = ?',
    [userId, contentId],
  );
  return r && toState(r);
}

export function saveState(userId: number, contentId: number, s: ItemState, favorite: boolean) {
  run(
    `INSERT INTO user_content (user_id, content_id, status, watched_episodes, is_favorite, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, content_id) DO UPDATE SET
       status = excluded.status, watched_episodes = excluded.watched_episodes,
       is_favorite = excluded.is_favorite, updated_at = excluded.updated_at`,
    [userId, contentId, s.status, s.watched, favorite, new Date().toISOString()],
  );
}

export const removeState = (userId: number, contentId: number) =>
  run('DELETE FROM user_content WHERE user_id = ? AND content_id = ?', [userId, contentId]);

export const favoritesCount = (userId: number) =>
  get<{ n: number }>('SELECT COUNT(*) AS n FROM user_content WHERE user_id = ? AND is_favorite = 1', [userId])!.n;

export function assertCanFavorite(userId: number, alreadyFavorite: boolean) {
  if (!alreadyFavorite && favoritesCount(userId) >= config.favoritesMax) {
    throw new HttpError(409, `Solo puedes tener ${config.favoritesMax} favoritos. Quita alguno para añadir otro.`);
  }
}

export interface LibraryFilter {
  status?: Status;
  type?: string;
  favorite?: boolean;
  q?: string;
}

const FILTER_SQL = (f: LibraryFilter, userId: number) => {
  const where = ['uc.user_id = ?'];
  const params: (string | number)[] = [userId];
  if (f.status) { where.push('uc.status = ?'); params.push(f.status); }
  if (f.type) { where.push('c.type = ?'); params.push(f.type); }
  if (f.favorite) where.push('uc.is_favorite = 1');
  if (f.q) { where.push('c.title LIKE ?'); params.push(`%${f.q}%`); }
  return { where, params };
};

const SELECT_ITEM = `SELECT c.*, uc.status, uc.watched_episodes, uc.is_favorite, uc.updated_at, uc.prev_episodes, uc.rewatch
     FROM user_content uc JOIN content c ON c.id = uc.content_id`;

/** Lista completa de una persona (ordenada por última actividad). Para exportar; las pantallas usan pageLibrary. */
export function listLibrary(userId: number, f: LibraryFilter = {}): LibraryItem[] {
  const { where, params } = FILTER_SQL(f, userId);
  return all<UserContentRow>(`${SELECT_ITEM} WHERE ${where.join(' AND ')} ORDER BY uc.updated_at DESC, c.id DESC`, params).map(toItem);
}

export const PAGE_SIZE = 24;
export const PAGE_MAX = 60;

export interface LibraryPage {
  items: LibraryItem[];
  /** Cursor para pedir el siguiente lote (null si no hay más). */
  nextCursor: string | null;
  /** Total con los filtros aplicados. */
  total: number;
}

/**
 * Un lote de la lista, ordenado por última actividad. Usa un cursor de teclado (fecha + id) y no un desplazamiento:
 * si el usuario cambia el estado de una tarjeta mientras se cargan más, el contenido que sube al principio no
 * provoca duplicados ni saltos en los lotes siguientes.
 */
export function pageLibrary(userId: number, f: LibraryFilter = {}, opts: { limit?: number; cursor?: string | null } = {}): LibraryPage {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? PAGE_SIZE) || PAGE_SIZE, 1), PAGE_MAX);
  const { where, params } = FILTER_SQL(f, userId);
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM user_content uc JOIN content c ON c.id = uc.content_id WHERE ${where.join(' AND ')}`, params)!.n;
  const w = [...where];
  const p = [...params];
  if (opts.cursor) {
    const m = /^(.+)[|](\d+)$/.exec(opts.cursor);
    if (!m) throw new HttpError(400, 'Cursor no válido');
    w.push('(uc.updated_at < ? OR (uc.updated_at = ? AND c.id < ?))');
    p.push(m[1], m[1], Number(m[2]));
  }
  const rows = all<UserContentRow>(`${SELECT_ITEM} WHERE ${w.join(' AND ')} ORDER BY uc.updated_at DESC, c.id DESC LIMIT ?`, [...p, limit + 1]);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { items: page.map(toItem), nextCursor: more && last ? `${last.updated_at}|${last.id}` : null, total };
}

/** Contadores de las pestañas (sobre toda la lista, sin filtros). */
export function libraryCounts(userId: number): Record<string, number> {
  const out: Record<string, number> = { todos: 0, favoritos: 0, POR_VER: 0, VIENDO: 0, FINALIZADO: 0, DEJADO: 0 };
  for (const r of all<{ status: string; n: number; fav: number }>(
    'SELECT status, COUNT(*) AS n, SUM(is_favorite) AS fav FROM user_content WHERE user_id = ? GROUP BY status', [userId],
  )) {
    out[r.status] = r.n;
    out.todos += r.n;
    out.favoritos += r.fav ?? 0;
  }
  return out;
}
