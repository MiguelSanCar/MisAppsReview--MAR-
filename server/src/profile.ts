import { all } from './db';
import { formatDuration } from './domain/time';
import { config } from './config';
import { episodeMinutes, minutesWatched, Status, STATUSES } from './domain/rules';
import { hasRuntimes, minutesOfFirst } from './domain/runtimes';
import { normalizeSeasons, parseSeasons, seasonsWatchedOf } from './domain/seasons';
import { toItem, UserContentRow } from './library';
import { scheduleRuntimesFor } from './runtimes';
import { getUser, publicUser } from './users';

/** Estadísticas y favoritos de una persona (se usa en perfil propio, de amigos y compartido). */
export function buildProfile(userId: number) {
  const user = getUser(userId)!;
  const rows = all<UserContentRow>(
    `SELECT c.*, uc.status, uc.watched_episodes, uc.is_favorite, uc.updated_at, uc.prev_episodes, uc.rewatch
     FROM user_content uc JOIN content c ON c.id = uc.content_id WHERE uc.user_id = ?`,
    [userId],
  );

  // Las series sin duración por temporada se completan en segundo plano (la próxima visita ya las usa)
  scheduleRuntimesFor(userId);

  let totalMinutes = 0;
  let episodes = 0;
  let seasonsWatched = 0;
  let revMinutes = 0;
  let revEpisodes = 0;
  let revContents = 0;
  let revTimes = 0;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const byType: Record<string, number> = { serie: 0, pelicula: 0, anime: 0 };
  for (const r of rows) {
    // Visionado actual + visionados anteriores (revisionado): volver a ver algo no borra lo ya visto
    const seen = r.watched_episodes + r.prev_episodes;
    const seasons = normalizeSeasons(parseSeasons(r.seasons), r.total_episodes);
    // Series con duración por temporada: se suman los minutos reales de los episodios vistos; si no, la duración fija
    const minutesOf = (count: number) => r.type === 'serie' && config.useRealRuntime && hasRuntimes(seasons)
      ? minutesOfFirst(seasons!, count, episodeMinutes(r.type, r.runtime_minutes))
      : minutesWatched(r.type, count, r.runtime_minutes);
    totalMinutes += minutesOf(seen);
    episodes += seen;
    if (r.rewatch > 0) {
      // Revisiones = todo lo visto menos el primer visionado (los anteriores suman prev_episodes, a partes iguales)
      const extra = Math.max(0, seen - Math.round(r.prev_episodes / r.rewatch));
      revEpisodes += extra;
      revMinutes += minutesOf(extra);
      revContents++;
      revTimes += r.rewatch;
    }
    byStatus[r.status]++;
    seasonsWatched += seasonsWatchedOf({
      type: r.type, status: r.status, watched: r.watched_episodes, previous: r.prev_episodes,
      seasons,
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
      /** Revisiones: lo visto a partir del segundo visionado de un contenido. */
      rewatches: { contents: revContents, times: revTimes, episodes: revEpisodes, totalMinutes: revMinutes, watchTime: formatDuration(revMinutes) },
      byStatus,
      finishedByType: byType,
    },
    favorites,
  };
}
