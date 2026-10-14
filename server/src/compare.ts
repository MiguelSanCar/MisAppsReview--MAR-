import type { buildProfile } from './profile';

type Profile = ReturnType<typeof buildProfile>;
export type Winner = 'me' | 'them' | 'tie';

export interface CompareRow {
  key: string;
  label: string;
  me: number;
  them: number;
  /** Texto a mostrar (p. ej. «3,5 días» para el tiempo visto). */
  meText: string;
  themText: string;
  /** Quién tiene más: 'me' (quien compara), 'them' (el otro perfil) o 'tie'. */
  winner: Winner;
}

interface Metric {
  key: string;
  label: string;
  value: (p: Profile) => number;
  text?: (p: Profile) => string;
}

const finished = (p: Profile) => p.stats.finishedByType.serie + p.stats.finishedByType.pelicula + p.stats.finishedByType.anime;

const METRICS: Metric[] = [
  { key: 'time', label: 'Tiempo visto', value: (p) => p.stats.totalMinutes, text: (p) => p.stats.watchTime.text },
  { key: 'episodes', label: 'Episodios vistos', value: (p) => p.stats.episodes },
  { key: 'seasons', label: 'Temporadas vistas', value: (p) => p.stats.seasonsWatched },
  { key: 'finished', label: 'Terminadas', value: finished },
  { key: 'serie', label: 'Series terminadas', value: (p) => p.stats.finishedByType.serie },
  { key: 'pelicula', label: 'Películas terminadas', value: (p) => p.stats.finishedByType.pelicula },
  { key: 'anime', label: 'Anime terminado', value: (p) => p.stats.finishedByType.anime },
  { key: 'viendo', label: 'Viendo ahora', value: (p) => p.stats.byStatus.VIENDO },
  { key: 'porver', label: 'Por ver', value: (p) => p.stats.byStatus.POR_VER },
  { key: 'dejado', label: 'Dejadas', value: (p) => p.stats.byStatus.DEJADO },
  { key: 'favorites', label: 'Favoritas', value: (p) => p.favorites.length },
];

/** Compara dos perfiles métrica a métrica: gana (verde) quien tiene más, pierde (rojo) quien tiene menos. */
export function compareProfiles(me: Profile, them: Profile): CompareRow[] {
  return METRICS.map((m) => {
    const a = m.value(me);
    const b = m.value(them);
    return {
      key: m.key,
      label: m.label,
      me: a,
      them: b,
      meText: m.text ? m.text(me) : String(a),
      themText: m.text ? m.text(them) : String(b),
      winner: a === b ? 'tie' : a > b ? 'me' : 'them',
    };
  });
}

export function summarize(rows: CompareRow[]) {
  return {
    me: rows.filter((r) => r.winner === 'me').length,
    them: rows.filter((r) => r.winner === 'them').length,
    ties: rows.filter((r) => r.winner === 'tie').length,
  };
}
