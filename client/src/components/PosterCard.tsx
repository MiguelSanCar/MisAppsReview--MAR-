import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { Content, dateEs, SOURCE_TEXT, Status, STATUS_TEXT, statusLabel, TYPE_TEXT, UserState } from '../types';
import { Emoji } from './Emoji';
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
   * `null` = no hay acción: sin botón. Sin indicar (búsqueda): botones 📋 Por ver, 👁️ Viendo y ✔️ Finalizado.
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
  return <img src={content.posterUrl} alt={`Póster de ${content.title}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
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

  /** Búsqueda: fija el estado con los botones 📋 / 👁️ / ✔️ (el estado activo no se repite). */
  async function setStatus(status: Status) {
    if (busy || !onState || state?.status === status) return;
    setBusy(true);
    try {
      const r = await api.put<{ state: UserState | null }>(`/api/library/${content.id}/status`, { status });
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

  // Lo que aún no se ha estrenado solo admite «Por ver»
  const locked = !!content.unreleased || content.watchable === 0;
  const lockedTitle = content.releaseDate ? `Aún no se ha estrenado (${dateEs(content.releaseDate)}): solo «Por ver»` : 'Aún no se ha estrenado: solo «Por ver»';
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
            {statusLabel(state.status, state.rewatch)}{progress ? ` · ${progress}` : ''}
            {state.rewatch > 0 && <Emoji name="repetir" size={12} className="in-text" />}
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

        {!readOnly && onState && !selectMode && advance === undefined && (
          // Tarjetas de búsqueda: 📋 Por ver · 👁️ Viendo (verde) · ✔️ Finalizado (morado)
          <>
            <button
              type="button"
              className={`poster-btn left st-btn todo ${state?.status === 'POR_VER' ? 'on' : ''}`}
              onClick={() => act('later')}
              disabled={busy}
              aria-pressed={state?.status === 'POR_VER'}
              title={state?.status === 'POR_VER' ? 'Quitar de «Por ver»' : 'Añadir a «Por ver»'}
              aria-label={`${state?.status === 'POR_VER' ? 'Quitar de' : 'Añadir a'} «Por ver»: ${content.title}`}
            >
              <Emoji name="lista" />
            </button>
            <button
              type="button"
              className={`poster-btn mid st-btn watching ${state?.status === 'VIENDO' ? 'on' : ''}`}
              onClick={() => setStatus('VIENDO')}
              disabled={busy || locked}
              aria-pressed={state?.status === 'VIENDO'}
              title={locked ? lockedTitle : 'Marcar como «Viendo»'}
              aria-label={`Marcar como Viendo: ${content.title}`}
            >
              <Emoji name="ojo" />
            </button>
            <button
              type="button"
              className={`poster-btn right st-btn done ${state?.status === 'FINALIZADO' ? 'on' : ''}`}
              onClick={() => setStatus('FINALIZADO')}
              disabled={busy || locked}
              aria-pressed={state?.status === 'FINALIZADO'}
              title={locked ? lockedTitle : 'Marcar como «Finalizado» (todos los episodios vistos)'}
              aria-label={`Marcar como Finalizado: ${content.title}`}
            >
              <Emoji name="tick" />
            </button>
          </>
        )}

        {!readOnly && onState && !selectMode && advance !== undefined && (
          // «Mi lista»: ♥ favorito y flecha de avanzar de fase / volver a ver
          <>
            <button
              type="button"
              className={`poster-btn left ${state?.favorite ? 'on fav' : ''}`}
              onClick={() => act('favorite')}
              disabled={busy || (locked && !state?.favorite)}
              aria-pressed={!!state?.favorite}
              title={state?.favorite ? 'Quitar de favoritos' : 'Favorito (se marca como visto)'}
            >
              <Icon name="heart" />
            </button>
            {advance && (
              <button
                type="button"
                className={`poster-btn right advance ${'rewatch' in advance ? 'again' : ''}`}
                onClick={moveOn}
                disabled={busy || locked}
                title={locked ? lockedTitle : advanceTitle}
                aria-label={`${advanceTitle}: «${content.title}»`}
              >
                <Icon name="later" />
              </button>
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
