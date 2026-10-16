import { all, run, transaction } from './db';
import { getContent } from './content';
import { diffStructure, reconcileProgress } from './domain/structure';
import { isFuture } from './domain/release';
import { normalizeSeasons, parseSeasons, Season } from './domain/seasons';
import type { TvSnap } from './domain/news';
import type { ItemState, Status } from './domain/rules';
import { scheduleRuntimes } from './runtimes';

/**
 * Mantiene al día la estructura de un contenido cuando TMDB la cambia (ver domain/structure.ts) y reajusta el progreso
 * de TODAS las personas que lo tienen, en su lista y en listas conjuntas. Se ejecuta dentro del motor de novedades,
 * una vez por contenido (la estructura es compartida), así que no cuesta peticiones extra.
 */

interface StateRow { status: Status; watched_episodes: number }

const same = (a: ItemState, b: ItemState) => a.status === b.status && a.watched === b.watched;

/**
 * Mantiene al día las fechas de estreno de las temporadas guardadas. Si una temporada que estaba por estrenar ya salió,
 * es como una temporada nueva para quien lo tenía Finalizado (pasa a «Por ver»).
 */
function refreshAir(contentId: number, old: Season[], snap: TvSnap, today: string) {
  const air = new Map(snap.seasons.map((s) => [s.n, s.air]));
  const next = old.map((s) => {
    const a = air.get(s.number);
    return a && a !== s.air ? { ...s, air: a } : s;
  });
  if (next.every((s, i) => s === old[i])) return;
  const nowOut = next.filter((s, i) => isFuture(old[i].air, today) && !isFuture(s.air, today)).map((s) => s.number);
  const total = next.reduce((n, s) => n + s.episodes, 0);
  transaction(() => {
    run('UPDATE content SET seasons = ? WHERE id = ?', [JSON.stringify(next), contentId]);
    if (!nowOut.length) return;
    const change = { next, total, added: nowOut, removed: [] as number[] };
    const now = new Date().toISOString();
    for (const u of all<StateRow & { user_id: number }>('SELECT user_id, status, watched_episodes FROM user_content WHERE content_id = ?', [contentId])) {
      const before: ItemState = { status: u.status, watched: u.watched_episodes };
      const after = reconcileProgress(before, next, change);
      if (!same(before, after)) run('UPDATE user_content SET status = ?, watched_episodes = ?, updated_at = ? WHERE user_id = ? AND content_id = ?', [after.status, after.watched, now, u.user_id, contentId]);
    }
    for (const it of all<StateRow & { list_id: number }>('SELECT list_id, status, watched_episodes FROM joint_list_items WHERE content_id = ?', [contentId])) {
      const before: ItemState = { status: it.status, watched: it.watched_episodes };
      const after = reconcileProgress(before, next, change);
      if (!same(before, after)) run('UPDATE joint_list_items SET status = ?, watched_episodes = ? WHERE list_id = ? AND content_id = ?', [after.status, after.watched, it.list_id, contentId]);
    }
  });
}

/** Aplica al contenido las temporadas añadidas o eliminadas. Devuelve las eliminadas. */
export function syncTvStructure(contentId: number, snap: TvSnap, today = new Date().toISOString().slice(0, 10)): number[] {
  const row = getContent(contentId);
  if (!row || row.type !== 'serie') return [];
  const old = normalizeSeasons(parseSeasons(row.seasons), row.total_episodes);
  if (!old) return [];
  const change = diffStructure(old, snap.seasons, today);
  if (!change) {
    refreshAir(contentId, old, snap, today);
    return [];
  }
  const now = new Date().toISOString();
  transaction(() => {
    run('UPDATE content SET seasons = ?, total_episodes = ? WHERE id = ?', [JSON.stringify(change.next), change.total, contentId]);
    for (const u of all<StateRow & { user_id: number }>('SELECT user_id, status, watched_episodes FROM user_content WHERE content_id = ?', [contentId])) {
      const before: ItemState = { status: u.status, watched: u.watched_episodes };
      const after = reconcileProgress(before, old, change);
      if (!same(before, after)) {
        run('UPDATE user_content SET status = ?, watched_episodes = ?, updated_at = ? WHERE user_id = ? AND content_id = ?', [after.status, after.watched, now, u.user_id, contentId]);
      }
      for (const n of change.removed) {
        run(
          `INSERT OR IGNORE INTO notifications (user_id, content_id, kind, dedupe_key, season, created_at) VALUES (?, ?, 'season_removed', ?, ?, ?)`,
          [u.user_id, contentId, `s:${n}:x`, n, now],
        );
      }
    }
    // Listas conjuntas: su progreso es de la lista, no de una persona. No cuenta como actividad (no pospone el borrado).
    for (const it of all<StateRow & { list_id: number }>('SELECT list_id, status, watched_episodes FROM joint_list_items WHERE content_id = ?', [contentId])) {
      const before: ItemState = { status: it.status, watched: it.watched_episodes };
      const after = reconcileProgress(before, old, change);
      if (!same(before, after)) {
        run('UPDATE joint_list_items SET status = ?, watched_episodes = ? WHERE list_id = ? AND content_id = ?', [after.status, after.watched, it.list_id, contentId]);
      }
    }
  });
  scheduleRuntimes(contentId); // la duración real de las temporadas nuevas, en segundo plano
  return change.removed;
}

/**
 * Una película que TMDB ya no tiene: se quita de las listas y de las listas conjuntas (así deja de contar en el perfil
 * y en las comparaciones) y cada persona recibe un aviso. El contenido sigue existiendo en la base de datos.
 */
export function removeMovie(contentId: number): void {
  const now = new Date().toISOString();
  transaction(() => {
    for (const u of all<{ user_id: number }>('SELECT user_id FROM user_content WHERE content_id = ?', [contentId])) {
      run(`INSERT OR IGNORE INTO notifications (user_id, content_id, kind, dedupe_key, created_at) VALUES (?, ?, 'movie_removed', 'x:movie', ?)`, [u.user_id, contentId, now]);
    }
    run('DELETE FROM user_content WHERE content_id = ?', [contentId]);
    run('DELETE FROM joint_list_items WHERE content_id = ?', [contentId]);
  });
}
