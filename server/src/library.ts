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

/** Lista de contenidos de una persona (ordenados por última actividad). */
export function listLibrary(userId: number, f: LibraryFilter = {}): LibraryItem[] {
  const where = ['uc.user_id = ?'];
  const params: (string | number)[] = [userId];
  if (f.status) { where.push('uc.status = ?'); params.push(f.status); }
  if (f.type) { where.push('c.type = ?'); params.push(f.type); }
  if (f.favorite) where.push('uc.is_favorite = 1');
  if (f.q) { where.push('c.title LIKE ?'); params.push(`%${f.q}%`); }
  return all<UserContentRow>(
    `SELECT c.*, uc.status, uc.watched_episodes, uc.is_favorite, uc.updated_at, uc.prev_episodes, uc.rewatch
     FROM user_content uc JOIN content c ON c.id = uc.content_id
     WHERE ${where.join(' AND ')} ORDER BY uc.updated_at DESC`,
    params,
  ).map(toItem);
}
