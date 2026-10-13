import { all } from './db';
import { formatDuration } from './domain/time';
import { minutesWatched, Status, STATUSES } from './domain/rules';
import { toItem, UserContentRow } from './library';
import { getUser, publicUser } from './users';

/** Estadísticas y favoritos de una persona (se usa en perfil propio, de amigos y compartido). */
export function buildProfile(userId: number) {
  const user = getUser(userId)!;
  const rows = all<UserContentRow>(
    `SELECT c.*, uc.status, uc.watched_episodes, uc.is_favorite, uc.updated_at
     FROM user_content uc JOIN content c ON c.id = uc.content_id WHERE uc.user_id = ?`,
    [userId],
  );

  let totalMinutes = 0;
  let episodes = 0;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const byType: Record<string, number> = { serie: 0, pelicula: 0, anime: 0 };
  for (const r of rows) {
    totalMinutes += minutesWatched(r.type, r.watched_episodes, r.runtime_minutes);
    episodes += r.watched_episodes;
    byStatus[r.status]++;
    if (r.status === 'FINALIZADO') byType[r.type]++;
  }

  const favorites = rows
    .filter((r) => r.is_favorite)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 10)
    .map(toItem);

  return {
    user: publicUser(user),
    stats: {
      totalMinutes,
      watchTime: formatDuration(totalMinutes),
      episodes,
      byStatus,
      finishedByType: byType,
    },
    favorites,
  };
}
