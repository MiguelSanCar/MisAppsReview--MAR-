import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../api';
import { PosterCard } from '../components/PosterCard';
import { ErrorBox, Spinner } from '../components/ui';
import { ContentType, LibraryItem, Status, STATUS_TEXT, STATUSES, UserState } from '../types';

type StatusFilter = 'todos' | 'favoritos' | Status;
type TypeFilter = 'todos' | ContentType;
const TYPE_CHIP: Record<TypeFilter, string> = { todos: 'Todo', serie: 'Series', pelicula: 'Películas', anime: 'Anime' };

/** Lista con pestañas por estado y filtro de tipo. Editable (Mi lista) o solo lectura (amigos, compartida). */
/** Fase siguiente según la pestaña: Por ver → Viendo → Finalizado. En «Todos», «Favoritos», «Finalizado» y «Dejado» no hay flecha. */
const NEXT_PHASE: Partial<Record<StatusFilter, Status>> = { POR_VER: 'VIENDO', VIENDO: 'FINALIZADO' };

export function ListGrid({
  items, onState, readOnly, noLinks, empty,
}: {
  items: LibraryItem[];
  onState?: (id: number, s: UserState | null) => void;
  readOnly?: boolean;
  noLinks?: boolean;
  empty?: string;
}) {
  const [status, setStatus] = useState<StatusFilter>('todos');
  const [type, setType] = useState<TypeFilter>('todos');
  const [q, setQ] = useState('');

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
      </div>
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
              advance={readOnly ? undefined : NEXT_PHASE[status] ? { to: NEXT_PHASE[status]! } : null}
            />
          ))}
        </div>
      ) : (
        <p className="muted center">{empty ?? 'No hay nada aquí todavía.'}</p>
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

  return (
    <div className="page">
      <h1 className="h1">Mi lista</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!items ? !error && <Spinner /> : (
        <ListGrid items={items} onState={onState} empty="Tu lista está vacía. Busca algo en Inicio para añadirlo." />
      )}
    </div>
  );
}
