import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/** Botón fijo abajo a la derecha para volver al comienzo de la página; aparece al bajar un poco. */
export function ScrollTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 400);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  if (!show) return null;
  return (
    <button type="button" className="scroll-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Volver arriba" title="Volver arriba">
      <ArrowUp size={22} aria-hidden="true" />
    </button>
  );
}
