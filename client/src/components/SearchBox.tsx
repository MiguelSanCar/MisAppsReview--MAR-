import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText, isAbort } from '../api';
import { LIVE_DEBOUNCE_MS, LIVE_SEARCH } from '../config';
import { Content, ContentType, UserState } from '../types';

export type TypeFilter = 'todo' | ContentType;
const FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'serie', label: 'Series' },
  { id: 'pelicula', label: 'Películas' },
  { id: 'anime', label: 'Anime' },
];

export interface SearchResponse {
  results: Content[];
  warnings: string[];
  states: Record<number, UserState | null>;
  tookMs?: number;
  /** Tiempo total medido en el navegador (red incluida). */
  clientMs?: number;
}

/** Búsqueda con cancelación: cada pulsación cancela la petición anterior y solo vale la última. */
export function useSearch() {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ctrl = useRef<AbortController | null>(null);

  const run = useCallback(async (q: string, type: TypeFilter) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError('');
    const t0 = performance.now();
    try {
      const r = await api.get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&type=${type}`, c.signal);
      setData({ ...r, clientMs: Math.round(performance.now() - t0) });
      setLoading(false);
    } catch (e) {
      if (isAbort(e)) return; // sustituida por una búsqueda más nueva
      setError(errorText(e));
      setData(null);
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    ctrl.current?.abort();
    setData(null);
    setLoading(false);
    setError('');
  }, []);

  return { data, loading, error, run, clear, setData };
}

interface Props {
  /** Se llama al escribir (si LIVE_SEARCH) y al pulsar Enter / Buscar. */
  onSearch: (q: string, type: TypeFilter) => void;
  /** Se llama cuando el cuadro queda vacío. */
  onClear?: () => void;
  /** Se llama al cambiar el filtro de tipo (la portada lo usa para cambiar las tendencias). */
  onType?: (type: TypeFilter) => void;
  /** Se llama cada vez que cambia el texto del cuadro (la portada vuelve arriba del todo). */
  onText?: () => void;
  placeholder?: string;
}

/** Buscador: los contenidos van apareciendo según se escribe (sin autocompletado: se retiró a petición). */
export function SearchBox({ onSearch, onClear, onType, onText, placeholder }: Props) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<TypeFilter>('todo');
  const input = useRef<HTMLInputElement>(null);
  const cb = useRef({ onSearch, onClear });
  cb.current = { onSearch, onClear };

  // Búsqueda al escribir (con espera tras la última letra)
  useEffect(() => {
    if (!LIVE_SEARCH) return;
    const text = q.trim();
    const t = setTimeout(() => {
      if (text.length >= 2) cb.current.onSearch(text, type);
      else if (text === '') cb.current.onClear?.();
    }, LIVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, type]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (text.length >= 2) onSearch(text, type);
  }

  function pick(t: TypeFilter) {
    setType(t);
    onType?.(t);
  }

  function clearAll() {
    setQ('');
    onClear?.();
    input.current?.focus();
  }

  return (
    <form className="searchbox" onSubmit={submit} role="search">
      <div className="search-field">
        <input
          ref={input}
          type="text"
          inputMode="search"
          autoComplete="off"
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); onText?.(); }}
          placeholder={placeholder ?? 'Busca una serie, película o anime…'}
          aria-label="Buscar"
        />
        {q && <button type="button" className="search-clear" onClick={clearAll} aria-label="Borrar búsqueda">✕</button>}
      </div>
      <button className="btn primary">Buscar</button>
      <div className="chips">
        {FILTERS.map((f) => (
          <button type="button" key={f.id} className={`chip ${type === f.id ? 'on' : ''}`} onClick={() => pick(f.id)} aria-pressed={type === f.id}>{f.label}</button>
        ))}
      </div>
    </form>
  );
}
