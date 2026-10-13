import { useEffect, useRef, useState } from 'react';
import { Ratings, Status, statusLabel, STATUSES, ContentType } from '../types';

export function StatusPicker({ value, onChange, disabled, rewatch = 0 }: { value: Status | null; onChange: (s: Status) => void; disabled?: boolean; rewatch?: number }) {
  return (
    <div className="seg" role="group" aria-label="Estado">
      {STATUSES.map((s) => (
        <button key={s} type="button" disabled={disabled} className={`seg-btn st-${s} ${value === s ? 'on' : ''}`} aria-pressed={value === s} onClick={() => onChange(s)}>
          {statusLabel(s, rewatch)}
        </button>
      ))}
    </div>
  );
}

/**
 * Contador de episodios: botones − / +, y al pulsar el número se convierte en un cuadro de texto
 * que solo admite dígitos. Si se supera el total, el servidor fija el máximo y marca Finalizado.
 */
export function EpisodeCounter({
  value, total, onSet, disabled,
}: { value: number; total: number | null; onSet: (n: number) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft === '') return;
    const n = Number(draft);
    if (n !== value) onSet(n);
  }

  return (
    <div className="counter">
      <span className="counter-label">Episodios vistos</span>
      <div className="counter-num">
        {editing ? (
          <input
            ref={input}
            className="counter-input"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={7}
            value={draft}
            aria-label="Episodios vistos"
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button type="button" className="counter-value" disabled={disabled} onClick={() => { setDraft(String(value)); setEditing(true); }} title="Pulsa para escribir el número">
            {value}
          </button>
        )}
        <span className="muted">/ {total ?? '?'}</span>
      </div>
      <div className="counter-btns">
        <button type="button" className="btn round" disabled={disabled || value <= 0} onClick={() => onSet(value - 1)} aria-label="Quitar un episodio">−</button>
        <button type="button" className="btn round" disabled={disabled || (total !== null && value >= total)} onClick={() => onSet(value + 1)} aria-label="Añadir un episodio">+</button>
      </div>
    </div>
  );
}

export function RatingBadges({ ratings, type, omdbOn }: { ratings: Ratings; type: ContentType; omdbOn: boolean }) {
  if (type === 'anime') {
    return (
      <div className="ratings">
        <span className="rating"><b>MyAnimeList</b>{ratings.mal ?? '—'}</span>
      </div>
    );
  }
  return (
    <div className="ratings">
      <span className="rating"><b>IMDb</b>{ratings.imdb ?? '—'}</span>
      <span className="rating"><b>Rotten Tomatoes</b>{ratings.rottenTomatoes ?? '—'}</span>
      {!omdbOn && <span className="muted small">Configura OMDB_API_KEY para ver las puntuaciones.</span>}
    </div>
  );
}
