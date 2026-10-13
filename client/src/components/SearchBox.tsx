import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText, isAbort } from '../api';
import { LIVE_DEBOUNCE_MS, LIVE_SEARCH, SUGGEST_DEBOUNCE_MS } from '../config';
import { Content, ContentType, TYPE_TEXT, UserState } from '../types';

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

interface Suggestion { title: string; year: number | null; type: ContentType; posterUrl: string | null }

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

function Highlight({ text, q }: { text: string; q: string }) {
  const n = q.trim().length;
  if (n && text.toLowerCase().startsWith(q.trim().toLowerCase())) return <><b>{text.slice(0, n)}</b>{text.slice(n)}</>;
  return <>{text}</>;
}

interface Props {
  /** Se llama al escribir (si LIVE_SEARCH), al pulsar Enter / Buscar o al elegir una sugerencia. */
  onSearch: (q: string, type: TypeFilter) => void;
  /** Se llama cuando el cuadro queda vacío. */
  onClear?: () => void;
  /** Se llama al cambiar el filtro de tipo (la portada lo usa para cambiar las tendencias). */
  onType?: (type: TypeFilter) => void;
  placeholder?: string;
}

export function SearchBox({ onSearch, onClear, onType, placeholder }: Props) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<TypeFilter>('todo');
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  // Tras elegir una sugerencia no hay que volver a buscar ni a pedir sugerencias para ese mismo texto.
  const skipLive = useRef<string | null>(null);
  const skipSug = useRef<string | null>(null);
  const cb = useRef({ onSearch, onClear });
  cb.current = { onSearch, onClear };

  // Búsqueda al escribir (con espera tras la última letra)
  useEffect(() => {
    if (!LIVE_SEARCH) return;
    if (skipLive.current === q) { skipLive.current = null; return; }
    const text = q.trim();
    const t = setTimeout(() => {
      if (text.length >= 2) cb.current.onSearch(text, type);
      else if (text === '') cb.current.onClear?.();
    }, LIVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, type]);

  // Sugerencias mientras se escribe
  useEffect(() => {
    if (skipSug.current === q) { skipSug.current = null; return; }
    const text = q.trim();
    if (text.length < 2) { setSugs([]); setOpen(false); return; }
    const c = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ suggestions: Suggestion[] }>(`/api/search/suggest?q=${encodeURIComponent(text)}&type=${type}`, c.signal);
        setSugs(r.suggestions);
        setActive(-1);
        setOpen(r.suggestions.length > 0);
      } catch (e) {
        if (!isAbort(e)) setSugs([]);
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => { clearTimeout(t); c.abort(); };
  }, [q, type]);

  function choose(title: string) {
    skipLive.current = title;
    skipSug.current = title;
    setQ(title);
    setOpen(false);
    setSugs([]);
    onSearch(title, type);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    setOpen(false);
    if (text.length >= 2) onSearch(text, type);
  }

  function pick(t: TypeFilter) {
    setType(t);
    onType?.(t);
  }

  function clearAll() {
    setQ('');
    setSugs([]);
    setOpen(false);
    onClear?.();
    input.current?.focus();
  }

  const showList = open && focused && sugs.length > 0;

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
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { setFocused(true); if (sugs.length) setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && sugs.length) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % sugs.length); }
            else if (e.key === 'ArrowUp' && sugs.length) { e.preventDefault(); setActive((a) => (a <= 0 ? sugs.length - 1 : a - 1)); }
            else if (e.key === 'Escape') setOpen(false);
            else if (e.key === 'Enter' && showList && active >= 0) { e.preventDefault(); choose(sugs[active].title); }
          }}
          placeholder={placeholder ?? 'Busca una serie, película o anime…'}
          aria-label="Buscar"
          role="combobox"
          aria-expanded={showList}
          aria-controls="sug-list"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `sug-${active}` : undefined}
        />
        {q && <button type="button" className="search-clear" onClick={clearAll} aria-label="Borrar búsqueda">✕</button>}
        {showList && (
          <ul id="sug-list" className="suggest" role="listbox" aria-label="Sugerencias">
            {sugs.map((s, i) => (
              <li
                key={`${s.title}-${s.year}`}
                id={`sug-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'on' : ''}
                onMouseDown={(e) => e.preventDefault()} // el campo no pierde el foco antes del clic
                onClick={() => choose(s.title)}
                onMouseEnter={() => setActive(i)}
              >
                {s.posterUrl ? <img src={s.posterUrl} alt="" loading="lazy" /> : <span className="sug-ph" />}
                <span className="sug-text">
                  <span className="sug-title"><Highlight text={s.title} q={q} /></span>
                  <span className="muted small">{[s.year, TYPE_TEXT[s.type]].filter(Boolean).join(' · ')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
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
