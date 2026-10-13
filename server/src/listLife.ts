import { all, run } from './db';
import { config } from './config';

const DAY = 86_400_000;

/**
 * Ciclo de vida de una lista conjunta: se borra tras `jointInactivityDays` (2 meses) sin actividad y
 * `warning` es true durante los últimos `jointWarningDays` (15 días) para avisar dentro de la app.
 * «Actividad» = cualquier cambio: crear, añadir, quitar, estado, episodios, rollback, unirse o salir.
 */
export function inactivityInfo(lastActivityAt: string, now = Date.now()) {
  const deleteAt = Date.parse(lastActivityAt) + config.jointInactivityDays * DAY;
  const warnFrom = deleteAt - config.jointWarningDays * DAY;
  return {
    lastActivityAt,
    deleteAt: new Date(deleteAt).toISOString(),
    daysLeft: Math.max(0, Math.ceil((deleteAt - now) / DAY)),
    warning: now >= warnFrom,
  };
}

/** Borra las listas sin actividad en el plazo (sus contenidos e historial caen en cascada). Devuelve los ids borrados. */
export function purgeInactiveLists(now = Date.now()): number[] {
  const cutoff = new Date(now - config.jointInactivityDays * DAY).toISOString();
  const ids = all<{ id: number }>('SELECT id FROM joint_lists WHERE COALESCE(last_activity_at, created_at) < ?', [cutoff]).map((r) => r.id);
  for (const id of ids) run('DELETE FROM joint_lists WHERE id = ?', [id]);
  return ids;
}

/** Tarea periódica: al arrancar y cada 6 horas. */
export function startMaintenance() {
  const tick = () => {
    try {
      const deleted = purgeInactiveLists();
      if (deleted.length) console.log(`Listas conjuntas borradas por inactividad: ${deleted.length}`);
    } catch (e) {
      console.error('Error en el mantenimiento de listas conjuntas', e);
    }
  };
  tick();
  setInterval(tick, 6 * 3600_000).unref();
}
