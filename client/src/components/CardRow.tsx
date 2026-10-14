import { Children, ReactNode, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fila de tarjetas con scroll lateral (con ajuste a cada tarjeta). En el móvil se desliza con el dedo; con ratón
 * aparecen flechas a los lados. Es una región con nombre y se puede recorrer con el teclado.
 */
export function CardRow({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [update, children]);

  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(ref.current.clientWidth * 0.8, 200), behavior: 'smooth' });

  return (
    <div className="hrow-wrap">
      <div className="hrow" ref={ref} onScroll={update} role="region" aria-label={label} tabIndex={0}>
        {Children.map(children, (c) => <div className="hrow-item">{c}</div>)}
      </div>
      <button type="button" className="hrow-arrow prev" aria-label="Ver anteriores" onClick={() => go(-1)} disabled={edge.start} hidden={edge.start && edge.end}>‹</button>
      <button type="button" className="hrow-arrow next" aria-label="Ver más" onClick={() => go(1)} disabled={edge.end} hidden={edge.start && edge.end}>›</button>
    </div>
  );
}
