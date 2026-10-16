import { useMemo, useState } from 'react';
import { dateEs, isFutureDate, type Season } from '../types';

/**
 * Episodios por temporadas. Los botones + y − del contador siguen mandando; esto es su reflejo (y un atajo): los
 * episodios se marcan por orden hasta el número de episodios vistos, y al pulsar uno se fija el progreso hasta ahí
 * (pulsar el último visto lo desmarca). Sin estructura de temporadas (anime, series sin datos) hay una sola sección.
 */
export function SeasonList({
  seasons, total, watched, disabled, onSet,
}: { seasons: Season[] | null; total: number | null; watched: number; disabled?: boolean; onSet: (n: number) => void }) {
  const sections = useMemo(() => {
    if (seasons?.length) return seasons.map((s) => ({ key: s.number, label: `Temporada ${s.number}`, episodes: s.episodes, air: isFutureDate(s.air) ? s.air : undefined }));
    return total && total > 1 ? [{ key: 0, label: 'Episodios', episodes: total, air: undefined as string | undefined }] : [];
  }, [seasons, total]);

  // Se abre por defecto la temporada en la que toca ver el siguiente episodio (o la última si ya se ha visto todo)
  const current = useMemo(() => {
    let end = 0;
    for (const s of sections) { end += s.episodes; if (watched < end) return s.key; }
    return sections[sections.length - 1]?.key;
  }, [sections, watched]);
  const [open, setOpen] = useState<Set<number>>(() => new Set(current === undefined ? [] : [current]));

  if (!sections.length) return null;
  let offset = 0;

  return (
    <div className="seasons" aria-label="Episodios por temporadas">
      {sections.map((s) => {
        const start = offset;
        offset += s.episodes;
        const seen = Math.min(Math.max(watched - start, 0), s.episodes);
        const done = seen === s.episodes;
        const future = !!s.air; // temporada por estrenar: se ve oscura y no se puede marcar
        const isOpen = open.has(s.key);
        return (
          <details
            key={s.key}
            className={`season ${done ? 'done' : ''} ${future ? 'future' : ''}`}
            open={isOpen}
            onToggle={(e) => {
              const now = (e.currentTarget as HTMLDetailsElement).open;
              setOpen((o) => { const n = new Set(o); if (now) n.add(s.key); else n.delete(s.key); return n; });
            }}
          >
            <summary>
              <span className="season-name">{s.label}</span>
              <span className="season-progress" aria-label={`${seen} de ${s.episodes} episodios vistos`}>{future ? `Estreno ${dateEs(s.air!)} · ${s.episodes} ep.` : <>{done ? '✓ ' : ''}{seen}/{s.episodes}</>}</span>
            </summary>
            {isOpen && (
              <div className="eps" role="group" aria-label={`Episodios de ${s.label}`}>
                {Array.from({ length: s.episodes }, (_, i) => {
                  const global = start + i + 1;
                  const on = global <= watched;
                  return (
                    <button
                      key={global}
                      type="button"
                      className={`ep ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      disabled={disabled || future}
                      title={future ? `${s.label}: aún no se ha estrenado` : `${s.label} · episodio ${i + 1}${on ? ' (visto)' : ''}`}
                      aria-label={`${s.label}, episodio ${i + 1}`}
                      onClick={() => onSet(global === watched ? global - 1 : global)}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}
