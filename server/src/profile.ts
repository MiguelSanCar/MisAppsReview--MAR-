import { all } from './db';
import { formatDuration } from './domain/time';
import { minutesWatched, Status, STATUSES } from './domain/rules';
import { normalizeSeasons, parseSeasons, seasonsWatchedOf } from './domain/seasons';
import { toItem, UserContentRow } from './library';
import { getUser, publicUser } from './users';

/** Estadísticas y favoritos de una persona (se usa en perfil propio, de amigos y compartido). */
export function buildProfile(userId: number) {
  const user = getUser(userId)!;
  const rows = all<UserContentRow>(
    `SELECT c.*, uc.status, uc.watched_episodes, uc.is_favorite, uc.updated_at, uc.prev_episodes, uc.rewatch
     FROM user_content uc JOIN content c ON c.id = uc.content_id WHERE uc.user_id = ?`,
    [userId],
  );

  let totalMinutes = 0;
  let episodes = 0;
  let seasonsWatched = 0;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const byType: Record<string, number> = { serie: 0, pelicula: 0, anime: 0 };
  for (const r of rows) {
    // Visionado actual + visionados anteriores (revisionado): volver a ver algo no borra lo ya visto
    const seen = r.watched_episodes + r.prev_episodes;
    totalMinutes += minutesWatched(r.type, seen, r.runtime_minutes);
    episodes += seen;
    byStatus[r.status]++;
    seasonsWatched += seasonsWatchedOf({
      type: r.type, status: r.status, watched: r.watched_episodes, previous: r.prev_episodes,
      seasons: normalizeSeasons(parseSeasons(r.seasons), r.total_episodes),
    });
    // «Terminadas»: finalizadas ahora o ya terminadas antes (está reviéndolas)
    if (r.status === 'FINALIZADO' || r.prev_episodes > 0) byType[r.type]++;
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
      /** Temporadas completas vistas (series con estructura de TMDB; una serie o anime terminado sin ella cuenta como 1). */
      seasonsWatched,
      byStatus,
      finishedByType: byType,
    },
    favorites,
  };
}
