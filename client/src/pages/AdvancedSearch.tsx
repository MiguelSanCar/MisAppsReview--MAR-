import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorText, isAbort } from '../api';
import { PosterCard } from '../components/PosterCard';
import { ErrorBox, Spinner } from '../components/ui';
import type { Content, UserState } from '../types';

interface Named { id: number; name: string }
interface DiscoverResponse {
  results: Content[];
  states: Record<number, UserState | null | undefined>;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

const SORTS: [string, string][] = [['popularity', 'Más populares'], ['rating', 'Mejor puntuadas'], ['date', 'Más recientes']];
const RATINGS = [5, 6, 7, 8, 9];
const thisYear = new Date().getFullYear();
const isYear = (v: string) => /^\d{4}$/.test(v) && +v >= 1900 && +v <= thisYear + 2;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** /search: descubrir series y películas con filtros combinables (plataforma, género, estudio, años, nota y orden). */
export default function AdvancedSearchPage() {
  const [sp, setSp] = useSearchParams();
  const type = sp.get('type') === 'pelicula' ? 'pelicula' : 'serie';
  const sort = SORTS.some(([k]) => k === sp.get('sort')) ? sp.get('sort')! : 'popularity';
  const platform = sp.get('platform') ?? '';
  const genre = sp.get('genre') ?? '';
  const studio = sp.get('studio') ?? '';
  const studioName = sp.get('studioName') ?? '';
  const yearFrom = sp.get('yearFrom') ?? '';
  const yearTo = sp.get('yearTo') ?? '';
  const minRating = sp.get('minRating') ?? '';
  const active = [platform, genre, studio, yearFrom, yearTo, minRating].filter(Boolean).length;

  const set = useCallback((patch: Record<string, string | undefined>) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
      return n;
    }, { replace: true });
  }, [setSp]);

  const [open, setOpen] = useState(() => active === 0 || window.matchMedia('(min-width: 720px)').matches);
  const [providers, setProviders] = useState<Named[]>([]);
  const [genres, setGenres] = useState<Named[]>([]);
  const [listsError, setListsError] = useState('');

  // Plataformas y géneros dependen del tipo (los catálogos de series y películas difieren)
  useEffect(() => {
    const c = new AbortController();
    setListsError('');
    Promise.all([
      api.get<{ providers: Named[] }>(`/api/discover/providers?type=${type}`, c.signal),
      api.get<{ genres: Named[] }>(`/api/discover/genres?type=${type}`, c.signal),
    ]).then(([p, g]) => { setProviders(p.providers); setGenres(g.genres); })
      .catch((e) => { if (!isAbort(e)) setListsError(errorText(e)); });
    return () => c.abort();
  }, [type]);

  // Estudio: sugerencias mientras se escribe
  const [studioText, setStudioText] = useState('');
  const dStudio = useDebounced(studioText.trim(), 300);
  const [suggestions, setSuggestions] = useState<Named[]>([]);
  useEffect(() => {
    if (dStudio.length < 2) { setSuggestions([]); return; }
    const c = new AbortController();
    api.get<{ studios: Named[] }>(`/api/discover/studios?q=${encodeURIComponent(dStudio)}`, c.signal).then((r) => setSuggestions(r.studios)).catch(() => {});
    return () => c.abort();
  }, [dStudio]);

  // Años: mientras se escribe no se avisa de nada ni se busca. Se aplican solos cuando son coherentes (4 cifras
  // válidas o vacío, y el inicial no mayor que el final); el error solo aparece al salir del campo o al pulsar «Buscar».
  const [yf, setYf] = useState(yearFrom);
  const [yt, setYt] = useState(yearTo);
  const [showYearError, setShowYearError] = useState(false);
  // Cada campo se sincroniza por separado: al confirmarse uno no se debe pisar lo que se escribe en el otro
  useEffect(() => { setYf(yearFrom); }, [yearFrom]);
  useEffect(() => { setYt(yearTo); }, [yearTo]);
  const coherent = (yf === '' || isYear(yf)) && (yt === '' || isYear(yt)) && !(isYear(yf) && isYear(yt) && +yf > +yt);
  useEffect(() => {
    if (coherent) setShowYearError(false);
    if (!coherent || (yf === yearFrom && yt === yearTo)) return;
    const t = setTimeout(() => set({ yearFrom: yf || undefined, yearTo: yt || undefined }), 450);
    return () => clearTimeout(t);
  }, [coherent, yf, yt, yearFrom, yearTo, set]);
  const yearsError = showYearError && !coherent;
  // Solo se marca el campo que falla (si el rango está al revés, los dos)
  const reversed = isYear(yf) && isYear(yt) && +yf > +yt;
  const fromBad = yearsError && ((yf !== '' && !isYear(yf)) || reversed);
  const toBad = yearsError && ((yt !== '' && !isYear(yt)) || reversed);
  /** Botón «Buscar» / Intro: si los años no son coherentes se avisa; si lo son, se aplican al momento. */
  const submit = () => {
    if (!coherent) { setShowYearError(true); return; }
    set({ yearFrom: yf || undefined, yearTo: yt || undefined });
    if (window.matchMedia('(max-width: 719px)').matches) setOpen(false); // en el móvil se pliegan los filtros para ver los resultados
    document.getElementById('adv-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Resultados con scroll infinito
  const query = useCallback((page: number) => {
    const p = new URLSearchParams({ type, sort, page: String(page) });
    if (platform) p.set('platform', platform);
    if (genre) p.set('genre', genre);
    if (studio) p.set('studio', studio);
    if (yearFrom) p.set('yearFrom', yearFrom);
    if (yearTo) p.set('yearTo', yearTo);
    if (minRating) p.set('minRating', minRating);
    return `/api/discover?${p}`;
  }, [type, sort, platform, genre, studio, yearFrom, yearTo, minRating]);

  const [items, setItems] = useState<Content[]>([]);
  const [states, setStates] = useState<DiscoverResponse['states']>({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const gen = useRef(0);

  useEffect(() => {
    const c = new AbortController();
    const my = ++gen.current;
    setLoaded(false); setError(''); setItems([]); setHasMore(false); setPage(1); busy.current = false;
    api.get<DiscoverResponse>(query(1), c.signal)
      .then((r) => { if (my !== gen.current) return; setItems(r.results); setStates(r.states); setHasMore(r.hasMore); setPage(1); setLoaded(true); })
      .catch((e) => { if (!isAbort(e) && my === gen.current) { setError(errorText(e)); setLoaded(true); } });
    return () => c.abort();
  }, [query]);

  const loadMore = useCallback(() => {
    if (!hasMore || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    setError('');
    const my = gen.current;
    const next = page + 1;
    api.get<DiscoverResponse>(query(next))
      .then((r) => {
        if (my !== gen.current) return;
        setItems((l) => { const have = new Set(l.map((i) => i.id)); return [...l, ...r.results.filter((i) => !have.has(i.id))]; });
        setStates((s) => ({ ...s, ...r.states }));
        setHasMore(r.hasMore); setPage(next);
      })
      .catch((e) => { if (my === gen.current) setError(errorText(e)); })
      .finally(() => { busy.current = false; setLoadingMore(false); });
  }, [hasMore, page, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, items.length, loadMore, error, loaded]);

  const onState = useCallback((id: number, s: UserState | null) => setStates((m) => ({ ...m, [id]: s })), []);
  const clear = () => { setStudioText(''); setSp(new URLSearchParams({ type, sort }), { replace: true }); };

  return (
    <div className="page adv">
      <h1 className="h1">Búsqueda</h1>

      <div className="adv-bar">
        <div className="chips" role="group" aria-label="Tipo de contenido" style={{ width: 'auto' }}>
          {([['serie', 'Series'], ['pelicula', 'Películas']] as const).map(([k, label]) => (
            <button key={k} className={`chip ${type === k ? 'on' : ''}`} aria-pressed={type === k} onClick={() => set({ type: k, genre: undefined, platform: undefined })}>{label}</button>
          ))}
        </div>
        <button className="btn ghost adv-toggle" aria-expanded={open} aria-controls="adv-filters" onClick={() => setOpen(!open)}>
          Filtros{active > 0 && <span className="count">{active}</span>}
        </button>
      </div>

      <section id="adv-filters" className="panel adv-filters" hidden={!open} aria-label="Filtros">
        {listsError && <ErrorBox>{listsError}</ErrorBox>}
        <form className="adv-form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="adv-grid">
          <label className="field">Ordenar por
            <select value={sort} onChange={(e) => set({ sort: e.target.value === 'popularity' ? undefined : e.target.value })}>
              {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label className="field">Plataforma
            <select value={platform} onChange={(e) => set({ platform: e.target.value || undefined })}>
              <option value="">Cualquiera</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">Género
            <select value={genre} onChange={(e) => set({ genre: e.target.value || undefined })}>
              <option value="">Cualquiera</option>
              {genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="field">Puntuación mínima
            <select value={minRating} onChange={(e) => set({ minRating: e.target.value || undefined })}>
              <option value="">Cualquiera</option>
              {RATINGS.map((n) => <option key={n} value={n}>{n} o más</option>)}
            </select>
          </label>
          <label className="field">Año desde
            <input type="text" inputMode="numeric" maxLength={4} placeholder="p. ej. 2010" value={yf} onChange={(e) => setYf(e.target.value.replace(/\D/g, ''))} onBlur={() => !coherent && setShowYearError(true)} aria-invalid={fromBad} aria-describedby={yearsError ? 'adv-year-error' : undefined} />
          </label>
          <label className="field">Año hasta
            <input type="text" inputMode="numeric" maxLength={4} placeholder={String(thisYear)} value={yt} onChange={(e) => setYt(e.target.value.replace(/\D/g, ''))} onBlur={() => !coherent && setShowYearError(true)} aria-invalid={toBad} aria-describedby={yearsError ? 'adv-year-error' : undefined} />
          </label>
          <div className="field adv-studio">
            <label htmlFor="adv-studio-in">Estudio o productora</label>
            {studio ? (
              <span className="adv-tag">{studioName || `Estudio ${studio}`}<button type="button" aria-label="Quitar el estudio" onClick={() => set({ studio: undefined, studioName: undefined })}>×</button></span>
            ) : (
              <>
                <input id="adv-studio-in" type="search" autoComplete="off" placeholder="Escribe: Marvel, Pixar…" value={studioText} onChange={(e) => setStudioText(e.target.value)} />
                {suggestions.length > 0 && (
                  <ul className="adv-suggest" role="listbox" aria-label="Estudios encontrados">
                    {suggestions.map((s) => (
                      <li key={s.id} role="option" aria-selected={false}>
                        <button type="button" onClick={() => { set({ studio: String(s.id), studioName: s.name }); setStudioText(''); setSuggestions([]); }}>{s.name}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
        {yearsError && <p id="adv-year-error" className="error-box adv-year-error" role="alert">Escribe años de 4 cifras y que el inicial no sea mayor que el final.</p>}
        <div className="adv-actions">
          <button type="button" className="btn ghost" onClick={clear} disabled={active === 0 && sort === 'popularity'}>Limpiar filtros</button>
          <button type="submit" className="btn primary">Buscar</button>
        </div>
        </form>
      </section>

      <section id="adv-results" aria-live="polite" aria-busy={!loaded || loadingMore}>
        {error && <ErrorBox>{error}</ErrorBox>}
        {!loaded && <Spinner text="Buscando…" />}
        {loaded && !error && !items.length && <p className="muted center">No hay resultados con estos filtros. Prueba a quitar alguno.</p>}
        {items.length > 0 && (
          <>
            <p className="meta-line muted small">{items.length} resultados{hasMore ? ' (se cargan más al bajar)' : ''}</p>
            <div className="grid">
              {items.map((c) => <PosterCard key={c.id} content={c} state={states[c.id]} onState={onState} showSource />)}
            </div>
          </>
        )}
        {loaded && hasMore && (
          <div ref={sentinel} className="list-more">
            {loadingMore ? <Spinner /> : <button className="btn ghost" onClick={loadMore}>Cargar más</button>}
          </div>
        )}
      </section>
    </div>
  );
}
