import { useEffect, useState } from 'react';
import { registerServiceWorker } from './register';

/** Aviso fijo «Hay una versión nueva · Actualizar»; se monta una vez en la raíz. */
export function UpdateBanner() {
  const [apply, setApply] = useState<null | (() => void)>(null);
  useEffect(() => { registerServiceWorker((fn) => setApply(() => fn)); }, []);
  if (!apply) return null;
  return (
    <div className="update-banner" role="status">
      <span>Hay una versión nueva</span>
      <button className="btn primary" onClick={apply}>Actualizar</button>
    </div>
  );
}
