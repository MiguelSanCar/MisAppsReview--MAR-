/* Service worker de MAR.
 * __BUILD__ lo sustituye vite.config.ts al compilar: así cada despliegue cambia este fichero y los móviles
 * detectan la versión nueva (el cliente avisa con «Actualizar»).
 * Reglas: /api nunca se intercepta (datos personales y en vivo); las carátulas (otros orígenes) las gestiona
 * la caché HTTP del navegador; solo se guardan ficheros propios de la app. */
const BUILD = '__BUILD__';
const SHELL = 'mar-shell-' + BUILD;
const ASSETS = 'mar-assets';
const MAX_ASSETS = 80;
const PRECACHE = ['/offline.html', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// El cliente pide activar la versión nueva cuando el usuario pulsa «Actualizar».
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

// Ficheros con hash (/assets/*): inmutables, primero la caché.
async function assetFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    await trim(cache);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // carátulas: caché HTTP del navegador
  if (url.pathname.startsWith('/api/')) return; // nunca se cachea

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(assetFirst(request));
    return;
  }
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
