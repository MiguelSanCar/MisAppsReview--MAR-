import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText, isAbort } from '../api';
import { CardRow } from '../components/CardRow';
import { PosterCard } from '../components/PosterCard';
import { SearchBox, SearchResponse, TypeFilter, useSearch } from '../components/SearchBox';
import { ErrorBox, Spinner } from '../components/ui';
import { LibraryItem, Recommendations, UserState } from '../types';

interface TrendingResponse extends SearchResponse { title: string; kind: string }

const MOMENT: Record<string, string> = { serie: 'Series del momento', pelicula: 'Películas del momento', anime: 'Anime del momento' };
const RECO_EMPTY: Record<string, string> = {
  sin_datos: 'Marca algunas series o películas (por ver, viendo o finalizadas) y aquí aparecerán recomendaciones según tus géneros favoritos.',
  anime: 'Las recomendaciones de anime llegarán más adelante: MyAnimeList no ofrece géneros todavía.',
  sin_tmdb: 'Las recomendaciones necesitan la clave de TMDB, que no está configurada en este servidor.',
};

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1).replace('.', ',')} s`;

export default function HomePage() {
  const search = useSearch();
  const [trendType, setTrendType] = useState<TypeFilter>('todo');
  const [trend, setTrend] = useState<TrendingResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState('');
  const [watching, setWatching] = useState<LibraryItem[]>([]);
  const [reco, setReco] = useState<Recommendations | null>(null);
  const [recoLoading, setRecoLoading] = useState(true);
  const [recoMoreLoading, setRecoMoreLoading] = useState(false);
  const recoBusy = useRef(false);
  const recoGen = useRef(0);
  const recoEnd = useRef<HTMLDivElement>(null);
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

  // Recomendaciones: «Todo» y «Series» → series; «Películas» → películas; «Anime» → aviso
  const recoType = trendType === 'todo' ? 'serie' : trendType;
  useEffect(() => {
    const c = new AbortController();
    const my = ++recoGen.current;
    recoBusy.current = false;
    setRecoLoading(true); setRecoMoreLoading(false);
    api.get<Recommendations>(`/api/recommendations?type=${recoType}`, c.signal)
      .then((r) => { if (my !== recoGen.current) return; setReco(r); setRecoLoading(false); })
      .catch((e) => { if (!isAbort(e) && my === recoGen.current) { setReco(null); setRecoLoading(false); } });
    return () => c.abort();
  }, [recoType]);

  // Las recomendaciones son una rejilla vertical: al llegar al final se pide la página siguiente
  const loadMoreReco = useCallback(() => {
    if (!reco?.hasMore || recoBusy.current) return;
    recoBusy.current = true;
    setRecoMoreLoading(true);
    const my = recoGen.current;
    api.get<Recommendations>(`/api/recommendations?type=${recoType}&page=${reco.page + 1}`)
      .then((r) => {
        if (my !== recoGen.current) return;
        setReco((cur) => {
          if (!cur) return r;
          const have = new Set(cur.items.map((i) => i.id));
          return { ...cur, items: [...cur.items, ...r.items.filter((i) => !have.has(i.id))], states: { ...cur.states, ...r.states }, page: r.page, hasMore: r.hasMore };
        });
      })
      .catch(() => setReco((cur) => (cur ? { ...cur, hasMore: false } : cur)))
      .finally(() => { recoBusy.current = false; setRecoMoreLoading(false); });
  }, [reco?.hasMore, reco?.page, recoType]);

  useEffect(() => {
    const el = recoEnd.current;
    if (!el || !reco?.hasMore || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMoreReco(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [reco?.hasMore, reco?.items.length, loadMoreReco]);

  useEffect(() => {
    api.get<{ items: LibraryItem[] }>('/api/library?status=VIENDO&limit=8').then((r) => setWatching(r.items.slice(0, 8))).catch(() => {});
  }, []);

  const onState = (id: number, state: UserState | null) => {
    search.setData((d) => (d ? { ...d, states: { ...d.states, [id]: state } } : d));
    setTrend((t) => (t ? { ...t, states: { ...t.states, [id]: state } } : t));
    setReco((r) => (r ? { ...r, states: { ...r.states, [id]: state } } : r));
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
              {d.results.map((c) => <PosterCard key={c.id} content={c} state={d.states[c.id]} onState={onState} showSource />)}
            </div>
          ) : (
            !d.warnings.length && <p className="muted center">Sin resultados. Prueba con otro título.</p>
          ))}
        </section>
      ) : (
        <>
          <section>
            <h2 className="h2 first">{trend ? MOMENT[trend.kind] ?? trend.title : 'Lo más visto del momento'}</h2>
            {trendError && <ErrorBox>{trendError}</ErrorBox>}
            {trend?.warnings.map((w) => <p key={w} className="note">{w}</p>)}
            {trendLoading && !trend && <Spinner />}
            {trend && trend.results.length > 0 && (
              <div className={trendLoading ? 'dim' : ''}>
                <CardRow label={MOMENT[trend.kind] ?? trend.title}>
                  {trend.results.map((c) => <PosterCard key={c.id} content={c} state={trend.states[c.id]} onState={onState} showSource />)}
                </CardRow>
              </div>
            )}
            {trend && !trend.results.length && !trend.warnings.length && <p className="muted center">No hay datos por ahora.</p>}
          </section>

          <section aria-live="polite">
            <h2 className="h2">{reco?.title ?? (trendType === 'pelicula' ? 'Películas que has podido ver' : 'Series que has podido ver')}</h2>
            {recoLoading && !reco && <Spinner />}
            {reco?.warnings.map((w) => <p key={w} className="note">{w}</p>)}
            {reco && reco.items.length > 0 && (
              <div className={`grid ${recoLoading ? 'dim' : ''}`}>
                {reco.items.map((c) => (
                  <div key={c.id} className="reco-card">
                    <PosterCard content={c} state={reco.states[c.id]} onState={onState} showSource />
                    {c.why && <span className="reco-why muted small">Por tu gusto por {c.why}</span>}
                  </div>
                ))}
              </div>
            )}
            {reco?.hasMore && (
              <div ref={recoEnd} className="list-more" aria-live="polite">
                {recoMoreLoading ? <Spinner /> : <button className="btn ghost" onClick={loadMoreReco}>Cargar más</button>}
              </div>
            )}
            {reco && !reco.items.length && !recoLoading && (reco.reason ? <p className="muted">{RECO_EMPTY[reco.reason]}</p> : !reco.warnings.length && <p className="muted">Todavía no hay recomendaciones nuevas para ti.</p>)}
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
