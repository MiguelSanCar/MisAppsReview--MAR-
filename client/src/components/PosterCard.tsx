import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { Content, SOURCE_TEXT, Status, STATUS_TEXT, statusLabel, TYPE_TEXT, UserState } from '../types';
import { Icon } from './ui';
import { useToast } from './Toast';

/** Qué hace la flecha de abajo a la derecha en «Mi lista»: pasar a la siguiente fase o volver a ver. */
export type Advance = { to: Status } | { rewatch: true };

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
  /** Añade la plataforma de origen (TMDB, MyAnimeList) tras el año y la categoría. */
  showSource?: boolean;
  /**
   * Si se indica, el botón de la flecha (abajo a la derecha) pasa el contenido a la siguiente fase
   * (Por ver → Viendo → Finalizado) o, en «Finalizado», lo vuelve a poner en «Por ver» para volver a verlo.
   * `null` = no hay acción: sin botón. Sin indicar: la flecha es «ver más adelante».
   */
  advance?: Advance | null;
  /** Papelera (arriba a la derecha): pide borrar el contenido de la lista. */
  onDelete?: () => void;
  /** Modo borrado: la tarjeta tiembla, se oculta favorito/flecha/papelera y un clic la (des)selecciona. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function PosterImage({ content }: { content: Pick<Content, 'posterUrl' | 'title'> }) {
  const [failed, setFailed] = useState(false);
  if (!content.posterUrl || failed) return <span className="poster-ph">{content.title}</span>;
  return <img src={content.posterUrl} alt={`Póster de ${content.title}`} loading="lazy" onError={() => setFailed(true)} />;
}

export function PosterCard({
  content, state, onState, readOnly, to, onOpen, showStatus, showSource, advance, onDelete, selectMode, selected, onToggleSelect,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function moveOn() {
    if (busy || !onState || !advance) return;
    setBusy(true);
    try {
      const r = 'rewatch' in advance
        ? await api.post<{ state: UserState | null }>(`/api/library/${content.id}/rewatch`)
        : await api.put<{ state: UserState | null }>(`/api/library/${content.id}/status`, { status: advance.to });
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
  const advanceTitle = advance ? ('rewatch' in advance ? 'Volver a ver (episodios a 0; tus estadísticas se conservan)' : `Pasar a ${STATUS_TEXT[advance.to]}`) : '';

  return (
    <article className={`pcard ${selectMode ? 'shaking' : ''} ${selected ? 'selected' : ''}`}>
      <div className="poster">
        {selectMode ? (
          <button type="button" className="poster-link" onClick={onToggleSelect} role="checkbox" aria-checked={!!selected} aria-label={`Seleccionar «${content.title}» para borrar`}>
            {poster}
          </button>
        ) : to === null ? (
          <div className="poster-link">{poster}</div>
        ) : onOpen ? (
          <button type="button" className="poster-link" onClick={onOpen} aria-label={`Abrir ${content.title}`}>{poster}</button>
        ) : (
          <Link className="poster-link" to={to ?? `/content/${content.id}`} aria-label={`Abrir ${content.title}`}>{poster}</Link>
        )}

        {showStatus && state && (
          <span className={`badge st-${state.status}`}>
            {statusLabel(state.status, state.rewatch)}{progress ? ` · ${progress}` : ''}{state.rewatch > 0 ? ' 🔁' : ''}
          </span>
        )}

        {selectMode && (
          <span className="sel-check" aria-hidden="true">{selected && <Icon name="check" />}</span>
        )}

        {!readOnly && onDelete && !selectMode && (
          <button type="button" className="poster-trash" onClick={onDelete} title="Eliminar de mi lista" aria-label={`Eliminar «${content.title}» de mi lista`}>
            <Icon name="trash" />
          </button>
        )}

        {!readOnly && onState && !selectMode && (
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
                  className={`poster-btn right advance ${'rewatch' in advance ? 'again' : ''}`}
                  onClick={moveOn}
                  disabled={busy}
                  title={advanceTitle}
                  aria-label={`${advanceTitle}: «${content.title}»`}
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
        <span className="muted">
          {[content.year, TYPE_TEXT[content.type], showSource ? SOURCE_TEXT[content.source] ?? content.source : null].filter(Boolean).join(' · ')}
        </span>
      </div>
    </article>
  );
}
