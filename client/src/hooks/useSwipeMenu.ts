import { useEffect } from 'react';

const MIN_DX = 70; // distancia mínima (px) del gesto
const MAX_MS = 900; // duración máxima
/** El gesto de abrir solo empieza en esta parte izquierda de la pantalla. */
const OPEN_ZONE = 0.35;

interface Scroller { el: Element; /** true = el elemento se reserva siempre el gesto (data-no-swipe). */ hard: boolean }

/** Primer ancestro que se desplaza de lado (o que se ha marcado con data-no-swipe). */
function sideScroller(el: Element | null): Scroller | null {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.hasAttribute('data-no-swipe')) return { el: e, hard: true };
    const cs = getComputedStyle(e);
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 2) return { el: e, hard: false };
  }
  return null;
}

/**
 * Menú lateral con gesto táctil (solo en móvil, donde es un cajón): deslizar de izquierda a derecha empezando en el
 * tercio izquierdo lo abre, y deslizar hacia la izquierda lo cierra. No interfiere con:
 *  - el scroll vertical (un gesto casi vertical se descarta),
 *  - las filas o tiras que se desplazan de lado: si el dedo empieza sobre una, el gesto es suyo; solo si ya está en su
 *    inicio y se desliza hacia la derecha (no puede ir a ningún sitio) se abre el menú,
 *  - los campos de texto, el recorte de foto (canvas) ni los diálogos abiertos.
 */
export function useSwipeMenu(open: boolean, setOpen: (v: boolean) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const mobile = () => !window.matchMedia('(min-width: 900px)').matches;
    let start: { x: number; y: number; t: number; sc: Element | null; sl0: number } | null = null;

    const onStart = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1 || !mobile() || document.querySelector('.modal-wrap')) return;
      const t = e.touches[0];
      const target = e.target as Element | null;
      if (target?.closest('input, textarea, select, canvas, [contenteditable]')) return;
      if (!open && t.clientX > window.innerWidth * OPEN_ZONE) return;
      const sc = sideScroller(target);
      if (sc?.hard) return;
      start = { x: t.clientX, y: t.clientY, t: Date.now(), sc: sc?.el ?? null, sl0: sc?.el.scrollLeft ?? 0 };
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      // Si el movimiento es sobre todo vertical, es un scroll: se abandona el gesto
      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
      // Movimiento horizontal que es del menú: se cancela para que el navegador no lo use como «atrás/adelante»
      const ours = !start.sc || (dx > 0 && start.sl0 === 0 && start.sc.scrollLeft === 0);
      if (ours && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5 && (open ? dx < 0 : dx > 0) && e.cancelable) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const s = start;
      start = null;
      const fast = Date.now() - s.t <= MAX_MS;
      const horizontal = Math.abs(dx) >= MIN_DX && Math.abs(dx) > Math.abs(dy) * 2;
      if (!fast || !horizontal) return;
      // Sobre una fila desplazable el gesto es de la fila, salvo que ya estuviera en su inicio y siga ahí (hacia la derecha)
      if (s.sc && (dx < 0 || s.sl0 > 0 || s.sc.scrollLeft > 0)) return;
      if (!open && dx > 0) setOpen(true);
      else if (open && dx < 0) setOpen(false);
    };
    const onCancel = () => { start = null; };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false }); // no pasivo: puede cancelar el gesto horizontal
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [open, setOpen, enabled]);
}
