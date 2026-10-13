import { useEffect, useRef, useState } from 'react';
import { api, errorText, isAbort } from '../api';
import { PosterCard } from '../components/PosterCard';
import { SearchBox, SearchResponse, TypeFilter, useSearch } from '../components/SearchBox';
import { ErrorBox, Spinner } from '../components/ui';
import { LibraryItem, UserState } from '../types';

interface TrendingResponse extends SearchResponse { title: string; kind: string }

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1).replace('.', ',')} s`;

export default function HomePage() {
  const search = useSearch();
  const [trendType, setTrendType] = useState<TypeFilter>('todo');
  const [trend, setTrend] = useState<TrendingResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState('');
  const [watching, setWatching] = useState<LibraryItem[]>([]);
  const trendCtrl = useRef<AbortController | null>(null);

  // Pantalla inicial: lo más visto del momento (cambia con el filtro de tipo)
  useEffect(() => {
    trendCtrl.current?.abort();
    const c = new AbortController();
    trendCtrl.current = c;
    setTrendLoading(true);
    setTrendError('');
    api.get<TrendingResponse>(`/api/search/trending?type=${trendType}`, c.signal)
      .then((r) => { setTrend(r); setTrendLoading(false); })
      .catch((e) => { if (!isAbort(e)) { setTrendError(errorText(e)); setTrendLoading(false); } });
    return () => c.abort();
  }, [trendType]);

  useEffect(() => {
    api.get<{ items: LibraryItem[] }>('/api/library?status=VIENDO').then((r) => setWatching(r.items.slice(0, 8))).catch(() => {});
  }, []);

  const onState = (id: number, state: UserState | null) => {
    search.setData((d) => (d ? { ...d, states: { ...d.states, [id]: state } } : d));
    setTrend((t) => (t ? { ...t, states: { ...t.states, [id]: state } } : t));
  };

  const searching = !!(search.data || search.loading || search.error);
  const d = search.data;

  return (
    <div className="page">
      <SearchBox onSearch={search.run} onClear={search.clear} onType={setTrendType} />

      {searching ? (
        <section aria-live="polite">
          {search.error && <ErrorBox>{search.error}</ErrorBox>}
          {d?.warnings.map((w) => <p key={w} className="note">{w}</p>)}
          {d && (
            <p className="meta-line muted small">
              {d.results.length} resultados
              {d.tookMs !== undefined && ` · ${secs(d.tookMs)} en el servidor`}
              {d.clientMs !== undefined && ` · ${secs(d.clientMs)} en total`}
              {search.loading && ' · actualizando…'}
            </p>
          )}
          {!d && search.loading && <Spinner text="Buscando…" />}
          {d && (d.results.length ? (
            <div className={`grid ${search.loading ? 'dim' : ''}`}>
              {d.results.map((c) => <PosterCard key={c.id} content={c} state={d.states[c.id]} onState={onState} />)}
            </div>
          ) : (
            !d.warnings.length && <p className="muted center">Sin resultados. Prueba con otro título.</p>
          ))}
        </section>
      ) : (
        <>
          <section>
            <h2 className="h2 first">{trend?.title ?? 'Lo más visto del momento'}</h2>
            {trendError && <ErrorBox>{trendError}</ErrorBox>}
            {trend?.warnings.map((w) => <p key={w} className="note">{w}</p>)}
            {trendLoading && !trend && <Spinner />}
            {trend && (
              <div className={`grid ${trendLoading ? 'dim' : ''}`}>
                {trend.results.map((c) => <PosterCard key={c.id} content={c} state={trend.states[c.id]} onState={onState} />)}
              </div>
            )}
            {trend && !trend.results.length && !trend.warnings.length && <p className="muted center">No hay datos por ahora.</p>}
          </section>

          {watching.length > 0 && (
            <section>
              <h2 className="h2">Siguiendo ahora</h2>
              <div className="grid">
                {watching.map((c) => <PosterCard key={c.id} content={c} readOnly showStatus state={c.state} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
