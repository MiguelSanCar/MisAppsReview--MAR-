import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../api';
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
export function ListGrid({
  items, onState, onRemoved, readOnly, noLinks, empty,
}: {
  items: LibraryItem[];
  onState?: (id: number, s: UserState | null) => void;
  /** Se llama con los ids ya borrados en el servidor. */
  onRemoved?: (ids: number[]) => void;
  readOnly?: boolean;
  noLinks?: boolean;
  empty?: string;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>('todos');
  const [type, setType] = useState<TypeFilter>('todos');
  const [q, setQ] = useState('');
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: items.length, favoritos: items.filter((i) => i.state.favorite).length };
    for (const s of STATUSES) c[s] = items.filter((i) => i.state.status === s).length;
    return c;
  }, [items]);

  const shown = items.filter(
    (i) =>
      (status === 'todos' || (status === 'favoritos' ? i.state.favorite : i.state.status === status)) &&
      (type === 'todos' || i.type === type) &&
      (!q || i.title.toLowerCase().includes(q.toLowerCase())),
  );

  const tabs: { id: StatusFilter; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    ...STATUSES.map((s) => ({ id: s as StatusFilter, label: STATUS_TEXT[s] })),
    { id: 'favoritos', label: 'Favoritos' },
  ];

  const EFFECT = 'Se eliminarán también sus episodios vistos y los minutos de tu perfil.';

  /** Borrar uno desde la papelera de su tarjeta. */
  function askOne(i: LibraryItem) {
    setPending({
      ids: [i.id],
      title: 'Borrar de tu lista',
      message: `¿Estás seguro de borrar permanentemente ${THIS_TYPE[i.type]} de tu lista?`,
      detail: `«${i.title}». ${EFFECT}`,
    });
  }

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
      onRemoved?.(pending.ids);
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

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function leaveDeleteMode() {
    setDeleteMode(false);
    setSelected(new Set());
  }

  const canDelete = !readOnly && !!onRemoved;

  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={status === t.id} className={`tab ${status === t.id ? 'on' : ''}`} onClick={() => setStatus(t.id)}>
            {t.label} <span className="count">{counts[t.id]}</span>
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
        {canDelete && items.length > 0 && (
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

      {shown.length ? (
        <div className="grid">
          {shown.map((i) => (
            <PosterCard
              key={i.id}
              content={i}
              state={i.state}
              onState={onState}
              readOnly={readOnly}
              showStatus
              to={noLinks ? null : undefined}
              advance={readOnly ? undefined : ADVANCE[status] ?? null}
              onDelete={canDelete ? () => askOne(i) : undefined}
              selectMode={deleteMode}
              selected={selected.has(i.id)}
              onToggleSelect={() => toggle(i.id)}
            />
          ))}
        </div>
      ) : (
        <p className="muted center">{empty ?? 'No hay nada aquí todavía.'}</p>
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
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ items: LibraryItem[] }>('/api/library').then((r) => setItems(r.items)).catch((e) => setError(errorText(e)));
  }, []);

  const onState = (id: number, s: UserState | null) =>
    setItems((l) => l && (s ? l.map((i) => (i.id === id ? { ...i, state: s } : i)) : l.filter((i) => i.id !== id)));
  const onRemoved = (ids: number[]) => setItems((l) => l && l.filter((i) => !ids.includes(i.id)));

  return (
    <div className="page">
      <h1 className="h1">Mi lista</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!items ? !error && <Spinner /> : (
        <ListGrid items={items} onState={onState} onRemoved={onRemoved} empty="Tu lista está vacía. Busca algo en Inicio para añadirlo." />
      )}
    </div>
  );
}
