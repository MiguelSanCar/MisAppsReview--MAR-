import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { PosterCard, PosterImage } from '../components/PosterCard';
import { useToast } from '../components/Toast';
import { EpisodeCounter, StatusPicker } from '../components/Tracker';
import { Avatar, ErrorBox, formatDate, Icon, Spinner } from '../components/ui';
import { HistoryEntry, ListItem, ListState, ListSummary, PublicUser, Status, STATUS_TEXT, UserState } from '../types';
import { SearchBox, useSearch } from '../components/SearchBox';


export function ListsPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [left, setLeft] = useState<ListSummary[]>([]);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [name, setName] = useState('');
  const [friendId, setFriendId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ lists: ListSummary[]; left: ListSummary[] }>('/api/lists').then((r) => { setLists(r.lists); setLeft(r.left); }).catch((e) => setError(errorText(e)));
    api.get<{ friends: PublicUser[] }>('/api/friends').then((r) => setFriends(r.friends)).catch(() => {});
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ id: number }>('/api/lists', { name, friendId: Number(friendId) });
      nav(`/lists/${r.id}`);
    } catch (err) { toast(errorText(err)); }
  }

  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  if (!lists) return <Spinner />;

  // Por ahora una lista por pareja: solo se ofrecen amigos con los que aún no hay lista (ni activa ni dejada)
  const paired = new Set([...lists, ...left].flatMap((x) => x.members.map((m) => m.id)));
  const available = friends.filter((f) => !paired.has(f.id));

  async function rejoin(id: number) {
    try { await api.post(`/api/lists/${id}/join`); nav(`/lists/${id}`); } catch (err) { toast(errorText(err)); }
  }

  return (
    <div className="page">
      <h1 className="h1">Mis listas conjuntas</h1>
      <p className="muted">Una lista que podéis editar los dos: contenidos, episodios y estados, con historial de cambios y vuelta atrás.</p>

      {available.length ? (
        <form className="inline-form" onSubmit={create}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la lista" maxLength={40} aria-label="Nombre de la lista" required />
          <select value={friendId} onChange={(e) => setFriendId(e.target.value)} aria-label="Amigo" required>
            <option value="">Con quién…</option>
            {available.map((f) => <option key={f.id} value={f.id}>{f.username}</option>)}
          </select>
          <button className="btn primary">Crear lista</button>
        </form>
      ) : (
        <p className="note">{friends.length ? 'Ya tienes una lista conjunta con cada uno de tus amigos (por ahora, una por pareja).' : <>Necesitas al menos un amigo para crear una lista conjunta. <Link to="/friends">Añadir amigos</Link></>}</p>
      )}

      {lists.length ? (
        <div className="fgrid">
          {lists.map((l) => (
            <Link key={l.id} to={`/lists/${l.id}`} className="lcard">
              <strong>{l.name}</strong>
              <span className="muted small">{l.items} contenidos</span>
              {l.inactivity.warning && <span className="badge-inline warn">Se borrará en {l.inactivity.daysLeft} días</span>}
              <span className="avatars">{l.members.map((m) => <Avatar key={m.id} user={m} size={32} />)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted center">Todavía no tienes listas conjuntas.</p>
      )}

      {left.length > 0 && (
        <section>
          <h2 className="h2">Listas que has dejado</h2>
          <p className="muted small">No se borran al salir: se conservan hasta que pasen 2 meses sin actividad.</p>
          <ul className="rows">
            {left.map((x) => (
              <li key={x.id}>
                <span className="avatars">{x.members.map((m) => <Avatar key={m.id} user={m} size={28} />)}</span>
                <strong>{x.name}</strong>
                {x.inactivity.warning && <span className="badge-inline warn">Se borrará en {x.inactivity.daysLeft} días</span>}
                <span className="spacer" />
                <button className="btn primary" onClick={() => rejoin(x.id)}>Volver a unirme</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const asUserState = (s: ListState): UserState => ({ ...s, favorite: false, updatedAt: '', rewatch: 0, previousEpisodes: 0 });

function describe(h: HistoryEntry): string {
  const st = (s: ListState | null) => (s ? `${STATUS_TEXT[s.status]}, ${s.watched} ep.` : 'fuera de la lista');
  switch (h.action) {
    case 'add': return 'añadió el contenido a la lista';
    case 'remove': return 'quitó el contenido de la lista';
    case 'status': return `cambió el estado: ${h.before ? STATUS_TEXT[h.before.status] : '—'} → ${h.after ? STATUS_TEXT[h.after.status] : '—'}`;
    case 'episodes': return `cambió los episodios vistos: ${h.before?.watched ?? 0} → ${h.after?.watched ?? 0}`;
    case 'rollback': return `volvió a un punto anterior (${st(h.after)})`;
  }
}

/** Ventana de un contenido de la lista: estado, episodios e historial con rollback. */
function ItemPanel({ listId, item, onChanged, onClose }: { listId: number; item: ListItem; onChanged: () => void; onClose: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<ListState>(item.state);
  const [total, setTotal] = useState(item.totalEpisodes);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [limit, setLimit] = useState(0);
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(() => {
    api.get<{ history: HistoryEntry[]; historyLimit: number }>(`/api/lists/${listId}/items/${item.id}/history`)
      .then((r) => { setHistory(r.history); setLimit(r.historyLimit); }).catch(() => {});
  }, [listId, item.id]);
  useEffect(loadHistory, [loadHistory]);

  async function change(body: object) {
    setBusy(true);
    try {
      const r = await api.put<{ state: ListState; totalEpisodes: number | null }>(`/api/lists/${listId}/items/${item.id}`, body);
      setState(r.state); setTotal(r.totalEpisodes);
      loadHistory(); onChanged();
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  async function rollback(h: HistoryEntry) {
    setBusy(true);
    try {
      const r = await api.post<{ state: ListState | null }>(`/api/lists/${listId}/items/${item.id}/rollback`, { historyId: h.id });
      if (r.state) setState(r.state);
      loadHistory(); onChanged();
      if (!r.state) onClose();
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  async function remove() {
    try { await api.del(`/api/lists/${listId}/items/${item.id}`); onChanged(); onClose(); } catch (e) { toast(errorText(e)); }
  }

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={item.title} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        <div className="modal-top">
          <div className="detail-poster small"><PosterImage content={item} /></div>
          <div>
            <h2 className="h2">{item.title}</h2>
            <p className="muted small">{[item.year, item.studio].filter(Boolean).join(' · ')}</p>
            <StatusPicker value={state.status} disabled={busy} onlyTodo={!!item.unreleased || item.watchable === 0} lockedTitle="Aún no se ha estrenado: de momento solo «Por ver»" onChange={(s: Status) => change({ status: s })} />
            <EpisodeCounter value={state.watched} total={total} max={item.watchable} disabled={busy || !!item.unreleased || item.watchable === 0} onSet={(n) => change({ watched: n })} />
            <button className="btn ghost danger" onClick={remove}>Quitar de la lista</button>
          </div>
        </div>

        <h3 className="h3">Historial de modificaciones</h3>
        <ul className="history">
          {history.map((h, idx) => (
            <li key={h.id}>
              <p>
                <b>{h.user}</b> {describe(h)} <span className="muted small">· {formatDate(h.createdAt)}</span>
                <button
                  className="rb"
                  onClick={() => rollback(h)}
                  disabled={busy || idx === 0}
                  title={idx === 0 ? 'Es el estado actual' : 'Volver a este punto'}
                  aria-label={`Volver al punto: ${describe(h)}`}
                >
                  Rollback <Icon name="rollback" />
                </button>
              </p>
            </li>
          ))}
          {!history.length && <li className="muted small">Aún no hay modificaciones.</li>}
        </ul>
        {limit > 0 && <p className="muted small">Se guardan las últimas {limit} modificaciones de cada lista.</p>}
      </div>
    </div>
  );
}

export function ListDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<{ list: ListSummary; items: ListItem[] } | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const search = useSearch();

  const load = useCallback(() => {
    api.get<NonNullable<typeof data>>(`/api/lists/${id}`).then(setData).catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);

  async function add(contentId: number) {
    try { await api.post(`/api/lists/${id}/items`, { contentId }); toast('Añadido a la lista', 'ok'); load(); } catch (e) { toast(errorText(e)); }
  }
  async function leaveList() {
    if (!window.confirm('¿Salir de esta lista? No se borra: la otra persona la conserva y podrás volver a unirte.')) return;
    try {
      await api.post(`/api/lists/${id}/leave`);
      toast('Has salido de la lista. Se conserva mientras haya actividad.', 'ok');
      nav('/lists');
    } catch (e) { toast(errorText(e)); }
  }
  async function removeList() {
    if (!window.confirm('¿Borrar esta lista para las dos personas?')) return;
    try { await api.del(`/api/lists/${id}`); nav('/lists'); } catch (e) { toast(errorText(e)); }
  }

  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox><Link to="/lists">Volver</Link></div>;
  if (!data) return <Spinner />;
  const inList = new Set(data.items.map((i) => i.id));
  const current = data.items.find((i) => i.id === open);

  return (
    <div className="page">
      <Link to="/lists" className="small">← Mis listas conjuntas</Link>
      <header className="list-head">
        <h1 className="h1">{data.list.name}</h1>
        <span className="avatars">
          {data.list.members.map((m) => (
            <span key={m.id} className={`member ${m.left ? 'gone' : ''}`}><Avatar user={m} size={32} /> {m.username}{m.left && <span className="muted small"> (ha salido)</span>}</span>
          ))}
        </span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setAdding(!adding)}>{adding ? 'Cerrar búsqueda' : '+ Añadir contenido'}</button>
        <button className="btn ghost" onClick={leaveList}>Salir de la lista</button>
        <button className="btn ghost danger" onClick={removeList}>Borrar lista</button>
      </header>

      {data.list.inactivity.warning && (
        <p className="note" role="status">
          Esta lista se borrará el <b>{new Date(data.list.inactivity.deleteAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</b> por
          inactividad (quedan {data.list.inactivity.daysLeft} días). Cualquier cambio la mantiene.
        </p>
      )}

      {adding && (
        <section className="panel">
          <SearchBox onSearch={search.run} onClear={search.clear} placeholder="Busca algo para añadir a la lista…" />
          {search.loading && <Spinner text="Buscando…" />}
          {search.error && <ErrorBox>{search.error}</ErrorBox>}
          {search.data?.warnings.map((w) => <p key={w} className="note">{w}</p>)}
          {search.data && (
            <div className="grid">
              {search.data.results.map((c) => (
                <div key={c.id} className="addable">
                  <PosterCard content={c} readOnly to={null} />
                  <button className="btn primary" disabled={inList.has(c.id)} onClick={() => add(c.id)}>{inList.has(c.id) ? 'Ya está en la lista' : 'Añadir'}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {data.items.length ? (
        <div className="grid">
          {data.items.map((i) => (
            <PosterCard key={i.id} content={i} state={asUserState(i.state)} readOnly showStatus onOpen={() => setOpen(i.id)} />
          ))}
        </div>
      ) : (
        <p className="muted center">La lista está vacía. Añade el primer contenido.</p>
      )}

      {current && <ItemPanel key={current.id} listId={data.list.id} item={current} onChanged={load} onClose={() => setOpen(null)} />}
    </div>
  );
}
