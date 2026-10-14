import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { errorText } from '../api';
import { NotificationItem, useNotifications } from '../notifications/NotificationsContext';
import { Emoji } from './Emoji';
import { useToast } from './Toast';

const TOAST_MS = 6000;

/** Carátula pequeña; si no carga se muestra un marcador. */
function NotifPoster({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="notif-poster notif-poster-ph" aria-hidden="true" />;
  return <img className="notif-poster" src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

const when = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace(/\./g, '');

/**
 * Campana de notificaciones (arriba a la derecha, a la izquierda del interruptor de tema).
 *  - En rojo cuando hay novedades sin ver; al entrar con ellas sale un aviso a su izquierda unos segundos.
 *  - Al pulsarla se abre un panel «Notificaciones»; pulsar un aviso lleva a la ficha del contenido y no hace nada más.
 *  - La primera vez, una ventana que oscurece el resto pide elegir entre todos los contenidos o solo los favoritos.
 */
export function NotificationBell() {
  const n = useNotifications();
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Set<number>>(new Set()); // los que eran nuevos al abrir el panel (llevan un punto)
  const [showToast, setShowToast] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(64);
  const btn = useRef<HTMLButtonElement>(null);
  const toastShown = useRef(false);
  const toastTimer = useRef<number>();

  // Aviso emergente: una vez por carga de la aplicación, cuando hay novedades sin ver
  useEffect(() => {
    if (!n.loaded || n.unseen === 0 || toastShown.current || open || intro) return;
    toastShown.current = true;
    setShowToast(true);
    toastTimer.current = window.setTimeout(() => setShowToast(false), TOAST_MS);
  }, [n.loaded, n.unseen, open, intro]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) btn.current?.focus();
  }, []);

  // El panel se cierra al pulsar fuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !panel.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  function openPanel(items: NotificationItem[], unseen: number) {
    setFresh(new Set(items.filter((i) => !i.seen).map((i) => i.id)));
    // El panel va fijo bajo la cabecera y pegado al borde derecho de la pantalla (no se recorta en el móvil)
    setTop(Math.round((btn.current?.getBoundingClientRect().bottom ?? 56) + 8));
    setOpen(true);
    setShowToast(false);
    if (unseen > 0) n.markSeen();
  }

  function toggle() {
    if (open) return close();
    setShowToast(false);
    if (!n.introSeen) return setIntro(true); // primera vez: antes del panel, la ventana de elección
    openPanel(n.items, n.unseen);
  }

  async function choose(favoritesOnly: boolean) {
    setBusy(true);
    try {
      const r = await n.savePrefs({ favoritesOnly, introSeen: true });
      setIntro(false);
      openPanel(r?.items ?? n.items, r?.unseen ?? n.unseen);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const has = n.unseen > 0;
  return (
    <div className="bell" ref={box}>
      <button
        ref={btn}
        type="button"
        className={`bell-btn ${has ? 'has-new' : ''}`}
        onClick={toggle}
        aria-label={has ? `Notificaciones, ${n.unseen} sin ver` : 'Notificaciones'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notif-panel"
        title="Notificaciones"
      >
        <Emoji name="campana" size={18} />
      </button>

      {showToast && <span className="bell-toast" role="status">Tienes actualizaciones pendientes</span>}

      {open && createPortal(
        <div id="notif-panel" ref={panel} className="notif-panel" style={{ top }} role="dialog" aria-label="Notificaciones">
          <header className="notif-head">
            <h2 className="notif-title">Notificaciones</h2>
            <button type="button" className="icon-btn" aria-label="Cerrar notificaciones" onClick={() => close(true)}>×</button>
          </header>
          {n.items.length ? (
            <ul className="notif-list">
              {n.items.map((i) => (
                <li key={i.id}>
                  <button type="button" className="notif-item" onClick={() => { close(); nav(`/content/${i.contentId}`); }}>
                    <NotifPoster src={i.posterUrl} />
                    <span className="notif-body">
                      <strong>{i.title}</strong>
                      <span className="notif-text">{i.text}</span>
                      <time className="notif-time muted small" dateTime={i.createdAt}>{when(i.createdAt)}</time>
                    </span>
                    {fresh.has(i.id) && <i className="notif-dot" role="img" aria-label="Nueva" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notif-empty">
              No hay novedades.
              {n.checking && <span className="muted small"> Comprobando tus contenidos…</span>}
            </p>
          )}
          {n.favoritesOnly && <p className="notif-foot muted small">Solo se muestran los avisos de tus favoritos (Ajustes).</p>}
        </div>,
        document.body,
      )}

      {intro && createPortal(
        <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="notif-intro-title">
          <div className="modal notif-intro">
            <h2 id="notif-intro-title" className="h2">Notificaciones</h2>
            <p>Aquí verás las novedades de lo que tienes en tu lista: nuevas temporadas y películas relacionadas.</p>
            <p>Pueden llegar muchas. Puedes cambiar a que solo te avisen de tus <strong>favoritos</strong> cuando quieras desde los <strong>Ajustes</strong>.</p>
            <p><strong>¿Con cuál quieres seguir?</strong></p>
            <div className="notif-intro-actions">
              <button type="button" className="btn primary" disabled={busy} onClick={() => choose(false)} autoFocus>De todos mis contenidos</button>
              <button type="button" className="btn" disabled={busy} onClick={() => choose(true)}>Solo de mis favoritos</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
