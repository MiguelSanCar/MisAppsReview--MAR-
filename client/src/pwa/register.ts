// Registro del service worker (solo en producción) y aviso de versión nueva.
let started = false;
let applying = false;

export function registerServiceWorker(onUpdate: (apply: () => void) => void) {
  if (started || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  started = true;

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const notify = (sw: ServiceWorker) => onUpdate(() => { applying = true; sw.postMessage('SKIP_WAITING'); });
        if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) notify(sw);
          });
        });
        // Al volver a la app (típico en el móvil) se busca una versión nueva.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  };
  // El efecto de React puede ejecutarse después del evento load: si ya pasó, se registra al momento.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);

  // Solo se recarga si el usuario pidió actualizar (la primera activación también dispara este evento).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) window.location.reload();
  });
}
