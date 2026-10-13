import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { Content, Status, STATUS_TEXT, TYPE_TEXT, UserState } from '../types';
import { Icon } from './ui';
import { useToast } from './Toast';

interface Props {
  content: Content;
  state?: UserState | null;
  /** Se llama con el nuevo estado tras pulsar corazón o flecha. */
  onState?: (contentId: number, state: UserState | null) => void;
  /** Sin botones (vista de solo lectura). */
  readOnly?: boolean;
  /** Destino al pulsar el póster (por defecto, la ficha). `null` = sin enlace. */
  to?: string | null;
  /** Acción alternativa en lugar de navegar. */
  onOpen?: () => void;
  showStatus?: boolean;
  /**
   * Si se indica, el botón de la flecha (abajo a la derecha) pasa el contenido a la siguiente fase
   * (p. ej. Por ver → Viendo) en lugar de «ver más adelante». `null` = no hay fase siguiente: sin botón.
   */
  advance?: { to: Status } | null;
}

export function PosterImage({ content }: { content: Pick<Content, 'posterUrl' | 'title'> }) {
  const [failed, setFailed] = useState(false);
  if (!content.posterUrl || failed) return <span className="poster-ph">{content.title}</span>;
  return <img src={content.posterUrl} alt={`Póster de ${content.title}`} loading="lazy" onError={() => setFailed(true)} />;
}

export function PosterCard({ content, state, onState, readOnly, to, onOpen, showStatus, advance }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function moveOn() {
    if (busy || !onState || !advance) return;
    setBusy(true);
    try {
      const r = await api.put<{ state: UserState | null }>(`/api/library/${content.id}/status`, { status: advance.to });
      onState(content.id, r.state);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(kind: 'favorite' | 'later') {
    if (busy || !onState) return;
    setBusy(true);
    try {
      const value = kind === 'favorite' ? !state?.favorite : state?.status !== 'POR_VER';
      const r = await api.put<{ state: UserState | null }>(`/api/library/${content.id}/${kind}`, { value });
      onState(content.id, r.state);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const progress = state && content.totalEpisodes && content.type !== 'pelicula' ? `${state.watched}/${content.totalEpisodes}` : null;
  const poster = <PosterImage content={content} />;

  return (
    <article className="pcard">
      <div className="poster">
        {to === null ? (
          <div className="poster-link">{poster}</div>
        ) : onOpen ? (
          <button type="button" className="poster-link" onClick={onOpen} aria-label={`Abrir ${content.title}`}>{poster}</button>
        ) : (
          <Link className="poster-link" to={to ?? `/content/${content.id}`} aria-label={`Abrir ${content.title}`}>{poster}</Link>
        )}
        {showStatus && state && <span className={`badge st-${state.status}`}>{STATUS_TEXT[state.status]}{progress ? ` · ${progress}` : ''}</span>}
        {!readOnly && onState && (
          <>
            <button
              type="button"
              className={`poster-btn left ${state?.favorite ? 'on fav' : ''}`}
              onClick={() => act('favorite')}
              disabled={busy}
              aria-pressed={!!state?.favorite}
              title={state?.favorite ? 'Quitar de favoritos' : 'Favorito (se marca como visto)'}
            >
              <Icon name="heart" />
            </button>
            {advance === undefined ? (
              <button
                type="button"
                className={`poster-btn right ${state?.status === 'POR_VER' ? 'on later' : ''}`}
                onClick={() => act('later')}
                disabled={busy}
                aria-pressed={state?.status === 'POR_VER'}
                title={state?.status === 'POR_VER' ? 'Quitar de ver más adelante' : 'Ver más adelante'}
              >
                <Icon name="later" />
              </button>
            ) : (
              advance && (
                <button
                  type="button"
                  className="poster-btn right advance"
                  onClick={moveOn}
                  disabled={busy}
                  title={`Pasar a ${STATUS_TEXT[advance.to]}`}
                  aria-label={`Pasar «${content.title}» a ${STATUS_TEXT[advance.to]}`}
                >
                  <Icon name="later" />
                </button>
              )
            )}
          </>
        )}
      </div>
      <div className="pcard-info">
        <strong title={content.title}>{content.title}</strong>
        <span className="muted">{[content.year, TYPE_TEXT[content.type]].filter(Boolean).join(' · ')}</span>
      </div>
    </article>
  );
}
