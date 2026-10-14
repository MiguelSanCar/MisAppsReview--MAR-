import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText, isAbort } from '../api';
import { Advance, PosterCard } from '../components/PosterCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { ErrorBox, Spinner } from '../components/ui';
import { ContentType, LibraryItem, Status, STATUS_TEXT, STATUSES, THIS_TYPE, UserState } from '../types';

type StatusFilter = 'todos' | 'favoritos' | Status;
type TypeFilter = 'todos' | ContentType;
const TYPE_CHIP: Record<TypeFilter, string> = { todos: 'Todo', serie: 'Series', pelicula: 'Películas', anime: 'Anime' };

/**
 * Qué hace la flecha de la tarjeta según la pestaña: Por ver → Viendo → Finalizado y, en «Finalizado»,
 * volver a ver (pasa a «Por ver» con los episodios a 0). En «Todos», «Favoritos» y «Dejado» no hay flecha.
 */
const ADVANCE: Partial<Record<StatusFilter, Advance>> = {
  POR_VER: { to: 'VIENDO' },
  VIENDO: { to: 'FINALIZADO' },
  FINALIZADO: { rewatch: true },
};

type Pending = { ids: number[]; title: string; message: string; detail: string } | null;

/**
 * Lista con pestañas por estado y filtro de tipo. Editable («Mi lista») o solo lectura (amigos, perfil público).
 * En «Mi lista» permite eliminar contenidos: con la papelera de cada tarjeta o con el modo «Eliminar» (selección múltiple).
 */
/** Lote de la lista que devuelve el servidor (ver GET /api/library). */
interface LibraryPage {
  items: LibraryItem[];
  nextCursor: string | null;
  total: number;
  counts?: Record<string, number>;
}
const EMPTY_COUNTS: Record<string, number> = { todos: 0, favoritos: 0, POR_VER: 0, VIENDO: 0, FINALIZADO: 0, DEJADO: 0 };
const PAGE_SIZE = 24;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Tarjeta de la lista. Va memoizada: con 300 contenidos cargados, un lote nuevo no debe volver a pintar los
 * 276 anteriores (el coste total pasaría de lineal a cuadrático). Por eso recibe callbacks estables.
 */
const ListCard = memo(function ListCard({ item, onState, readOnly, noLinks, advance, onAsk, selectMode, selected, onToggle }: {
  item: LibraryItem;
  onState?: (id: number, s: UserState | null) => void;
  readOnly?: boolean;
  noLinks?: boolean;
  advance?: Advance | null;
  onAsk?: (i: LibraryItem) => void;
  selectMode: boolean;
  selected: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <PosterCard
      content={item}
      state={item.state}
      onState={onState}
      readOnly={readOnly}
      showStatus
      to={noLinks ? null : undefined}
      advance={advance}
      onDelete={onAsk ? () => onAsk(item) : undefined}
      selectMode={selectMode}
      selected={selected}
      onToggleSelect={() => onToggle(item.id)}
    />
  );
});

export function ListGrid({
  endpoint, readOnly, noLinks, empty,
}: {
  /** Ruta que devuelve la lista paginada: /api/library o /api/profiles/<usuario>/library. */
  endpoint: string;
  readOnly?: boolean;
  noLinks?: boolean;
  empty?: string;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>('todos');
  const [type, setType] = useState<TypeFilter>('todos');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>(EMPTY_COUNTS);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  /** Estado cuyo contador se ilumina un momento en verde tras mover una tarjeta con la flecha. */
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number>();
  const itemsRef = useRef<LibraryItem[]>([]);
  itemsRef.current = items;
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  const sentinel = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const gen = useRef(0); // identifica la carga vigente: las respuestas de filtros anteriores se descartan

  const query = useCallback((after?: string | null) => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (status === 'favoritos') p.set('favorite', '1');
    else if (status !== 'todos') p.set('status', status);
    if (type !== 'todos') p.set('type', type);
    if (dq.trim()) p.set('q', dq.trim());
    if (after) p.set('cursor', after);
    return `${endpoint}?${p}`;
  }, [endpoint, status, type, dq]);

  // Primer lote: al entrar y cada vez que cambia un filtro
  useEffect(() => {
    const ctl = new AbortController();
    const my = ++gen.current;
    setLoaded(false); setError(''); setItems([]); setCursor(null); setLoadingMore(false); busyRef.current = false;
    api.get<LibraryPage>(query(), ctl.signal)
      .then((r) => {
        if (my !== gen.current) return;
        setItems(r.items); setCursor(r.nextCursor); if (r.counts) setCounts(r.counts); setLoaded(true);
      })
      .catch((e) => { if (!isAbort(e) && my === gen.current) { setError(errorText(e)); setLoaded(true); } });
    return () => ctl.abort();
  }, [query]);

  const loadMore = useCallback(() => {
    if (!cursor || busyRef.current) return;
    busyRef.current = true;
    setLoadingMore(true);
    setError('');
    const my = gen.current;
    api.get<LibraryPage>(query(cursor))
      .then((r) => {
        if (my !== gen.current) return;
        setItems((l) => { const have = new Set(l.map((i) => i.id)); return [...l, ...r.items.filter((i) => !have.has(i.id))]; });
        setCursor(r.nextCursor);
      })
      .catch((e) => { if (my === gen.current) setError(errorText(e)); })
      .finally(() => { busyRef.current = false; setLoadingMore(false); });
  }, [cursor, query]);

  // Al acercarse al final se piden más. El observador se recrea tras cada lote: si el final sigue a la vista
  // (pantalla alta) se vuelve a disparar y se encadenan lotes hasta llenarla, sin cargar nada más.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || error) return;
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, items.length, loadMore, error, loaded]);

  const refreshCounts = useCallback(() => {
    api.get<LibraryPage>(`${endpoint}?limit=1`).then((r) => r.counts && setCounts(r.counts)).catch(() => {});
  }, [endpoint]);

  const onState = useCallback((id: number, s: UserState | null) => {
    const prev = itemsRef.current.find((i) => i.id === id);
    setItems((l) => (s ? l.map((i) => (i.id === id ? { ...i, state: s } : i)) : l.filter((i) => i.id !== id)));
    if (s && prev && prev.state.status !== s.status) {
      // El número del estado nuevo sube al instante y se ilumina un momento: así se ve adónde ha ido la tarjeta
      const from = prev.state.status;
      setCounts((c) => ({ ...c, [from]: Math.max(0, (c[from] ?? 0) - 1), [s.status]: (c[s.status] ?? 0) + 1 }));
      setFlash(s.status);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
    }
    refreshCounts();
  }, [refreshCounts]);

  const matches = (i: LibraryItem) =>
    (status === 'todos' || (status === 'favoritos' ? i.state.favorite : i.state.status === status)) &&
    (type === 'todos' || i.type === type) &&
    (!dq.trim() || i.title.toLowerCase().includes(dq.trim().toLowerCase()));
  const shown = items.filter(matches);

  const tabs: { id: StatusFilter; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    ...STATUSES.map((s) => ({ id: s as StatusFilter, label: STATUS_TEXT[s] })),
    { id: 'favoritos', label: 'Favoritos' },
  ];

  const EFFECT = 'Se eliminarán también sus episodios vistos y los minutos de tu perfil.';

  /** Borrar uno desde la papelera de su tarjeta. */
  const askOne = useCallback((i: LibraryItem) => {
    setPending({
      ids: [i.id],
      title: 'Borrar de tu lista',
      message: `¿Estás seguro de borrar permanentemente ${THIS_TYPE[i.type]} de tu lista?`,
      detail: `«${i.title}». ${EFFECT}`,
    });
  }, []);

  /** Borrar los seleccionados en el modo «Eliminar» (segunda confirmación). */
  function askSelected() {
    const n = selected.size;
    setPending({
      ids: [...selected],
      title: 'Confirmar borrado',
      message: `¿Estás seguro de borrar permanentemente ${n === 1 ? '1 contenido' : `${n} contenidos`} de tu lista?`,
      detail: EFFECT,
    });
  }

  async function doDelete() {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await api.post<{ deleted: number }>('/api/library/delete', { ids: pending.ids });
      setItems((l) => l.filter((i) => !pending.ids.includes(i.id)));
      refreshCounts();
      toast(r.deleted === 1 ? 'Contenido eliminado de tu lista' : `${r.deleted} contenidos eliminados de tu lista`, 'ok');
      setPending(null);
      setSelected(new Set());
      setDeleteMode(false);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const toggle = useCallback((id: number) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  function leaveDeleteMode() {
    setDeleteMode(false);
    setSelected(new Set());
  }

  const canDelete = !readOnly;
  const advance = readOnly ? undefined : ADVANCE[status] ?? null;

  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={status === t.id} className={`tab ${status === t.id ? 'on' : ''}`} onClick={() => setStatus(t.id)}>
            {t.label} <span className={`count ${flash === t.id ? 'flash' : ''}`}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="filters-row">
        <input type="search" className="mini-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por título…" aria-label="Filtrar por título" />
        <div className="chips">
          {(['todos', 'serie', 'pelicula', 'anime'] as TypeFilter[]).map((t) => (
            <button key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)} aria-pressed={type === t}>
              {TYPE_CHIP[t]}
            </button>
          ))}
        </div>
        {canDelete && counts.todos > 0 && (
          <div className="delete-tools">
            {deleteMode ? (
              <>
                <span className="muted small" aria-live="polite">{selected.size === 1 ? '1 seleccionado' : `${selected.size} seleccionados`}</span>
                <button className="btn danger-solid" disabled={selected.size === 0} onClick={askSelected}>Confirmar borrado</button>
                <button className="btn ghost" onClick={leaveDeleteMode}>Cancelar</button>
              </>
            ) : (
              <button className="btn danger-solid" onClick={() => setDeleteMode(true)}>Eliminar</button>
            )}
          </div>
        )}
      </div>

      {deleteMode && <p className="note delete-hint">Modo borrado: pulsa las tarjetas que quieras eliminar y después «Confirmar borrado».</p>}

      {!loaded ? <Spinner /> : shown.length ? (
        <div className="grid">
          {shown.map((i) => (
            <ListCard
              key={i.id}
              item={i}
              onState={readOnly ? undefined : onState}
              readOnly={readOnly}
              noLinks={noLinks}
              advance={advance}
              onAsk={canDelete ? askOne : undefined}
              selectMode={deleteMode}
              selected={selected.has(i.id)}
              onToggle={toggle}
            />
          ))}
        </div>
      ) : (
        <p className="muted center">{counts.todos === 0 ? (empty ?? 'No hay nada aquí todavía.') : 'No hay nada aquí todavía.'}</p>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      {loaded && cursor && (
        <div ref={sentinel} className="list-more" aria-live="polite">
          {loadingMore ? <Spinner /> : <button className="btn ghost" onClick={loadMore}>Cargar más</button>}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          detail={pending.detail}
          confirmLabel="Borrar permanentemente"
          busy={busy}
          onConfirm={doDelete}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}

export function MyListPage() {
  return (
    <div className="page">
      <h1 className="h1">Mi lista</h1>
      <ListGrid endpoint="/api/library" empty="Tu lista está vacía. Busca algo en Inicio para añadirlo." />
    </div>
  );
}
