import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { Emoji } from '../components/Emoji';
import { PosterImage } from '../components/PosterCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SeasonList } from '../components/SeasonList';
import { EpisodeCounter, RatingBadges, StatusPicker } from '../components/Tracker';
import { useToast } from '../components/Toast';
import { ErrorBox, Icon, Spinner } from '../components/ui';
import { Content, Status, THIS_TYPE, TYPE_TEXT, UserState } from '../types';

interface Loaded { content: Content; state: UserState | null }
interface Reply { state: UserState | null; totalEpisodes: number | null }

export default function ContentPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [omdbOn, setOmdbOn] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setData(null); setError('');
    api.get<Loaded>(`/api/content/${id}`).then(setData).catch((e) => setError(errorText(e)));
    api.get<{ omdb: boolean }>('/api/search/status').then((s) => setOmdbOn(s.omdb)).catch(() => {});
  }, [id]);

  async function update(kind: 'favorite' | 'later' | 'status' | 'episodes', body: object) {
    if (busy || !data) return;
    setBusy(true);
    try {
      const r = await api.put<Reply>(`/api/library/${id}/${kind}`, body);
      setData((d) => d && { content: { ...d.content, totalEpisodes: r.totalEpisodes ?? d.content.totalEpisodes }, state: r.state });
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  /** Quita el contenido de la lista (y con él sus episodios y minutos del perfil). */
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await api.del(`/api/library/${id}`);
      setData((d) => d && { ...d, state: null });
      setConfirmDelete(false);
      toast('Contenido eliminado de tu lista', 'ok');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox><button className="btn ghost" onClick={() => nav(-1)}>← Volver</button></div>;
  if (!data) return <Spinner />;

  const { content: c, state } = data;
  return (
    <div className="page content-page">
      <button className="back" onClick={() => nav(-1)}>← Volver</button>
      <div className="detail">
        <div className="detail-poster"><PosterImage content={c} /></div>

        <div className="detail-main">
          <h1>{c.title}</h1>
          <p className="muted">{[TYPE_TEXT[c.type], c.year, c.studio].filter(Boolean).join(' · ')}</p>
          <RatingBadges ratings={c.ratings} type={c.type} omdbOn={omdbOn} />
          {c.imdbUrl && <a className="small" href={c.imdbUrl} target="_blank" rel="noreferrer">Ver en IMDb ↗</a>}
          <p className="synopsis">{c.synopsis || 'Sin sinopsis disponible.'}</p>

          <div className="detail-actions">
            <button className={`btn ${state?.favorite ? 'fav-on' : 'ghost'}`} disabled={busy} aria-pressed={!!state?.favorite} onClick={() => update('favorite', { value: !state?.favorite })}>
              <Icon name="heart" /> {state?.favorite ? 'En favoritos' : 'Favorito'}
            </button>
            <button className={`btn ${state?.status === 'POR_VER' ? 'later-on' : 'ghost'}`} disabled={busy} aria-pressed={state?.status === 'POR_VER'} onClick={() => update('later', { value: state?.status !== 'POR_VER' })}>
              <Icon name="later" /> {state?.status === 'POR_VER' ? 'Para ver más adelante' : 'Ver más adelante'}
            </button>
          </div>

          <h2 className="h2">Estado</h2>
          <StatusPicker
            value={state?.status ?? null}
            rewatch={state?.rewatch ?? 0}
            disabled={busy}
            onChange={(s: Status) => update('status', { status: s })}
            onDelete={() => setConfirmDelete(true)}
            canDelete={!!state}
          />
          {!!state?.rewatch && (
            <p className="rewatch-note"><Emoji name="repetir" size={15} className="in-text" /> Visionado n.º {state.rewatch + 1}. Los episodios de tus visionados anteriores ({state.previousEpisodes}) siguen contando en tus estadísticas.</p>
          )}

          <EpisodeCounter value={state?.watched ?? 0} total={c.totalEpisodes} disabled={busy} onSet={(n) => update('episodes', { watched: n })} />
          <p className="muted small">
            {c.type === 'pelicula' ? 'Una película cuenta como 1 episodio.' : 'Si escribes un número mayor al total, se fija el máximo y pasa a Finalizado.'}
          </p>
          {c.type !== 'pelicula' && (
            <SeasonList key={c.id} seasons={c.seasons ?? null} total={c.totalEpisodes} watched={state?.watched ?? 0} disabled={busy} onSet={(n) => update('episodes', { watched: n })} />
          )}
          <Link to="/home" className="small">Buscar otro título</Link>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Borrar de tu lista"
          message={`¿Estás seguro de borrar permanentemente ${THIS_TYPE[c.type]} de tu lista?`}
          detail={`«${c.title}». Se eliminarán también sus episodios vistos y los minutos de tu perfil.`}
          confirmLabel="Borrar permanentemente"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
