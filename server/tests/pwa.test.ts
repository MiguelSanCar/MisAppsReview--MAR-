import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, startTestApp } from './client';

const publicDir = path.resolve(__dirname, '../../client/public');
const distDir = path.resolve(__dirname, '../../client/dist');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'));

describe('manifiesto de la PWA (client/public)', () => {
  it('tiene lo necesario para ser instalable', () => {
    expect(manifest.name).toMatch(/MAR/);
    expect(manifest.short_name).toBe('MAR');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('es');
    const sizes = manifest.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toContain('192x192:any');
    expect(sizes).toContain('512x512:any');
    expect(sizes).toContain('512x512:maskable');
  });

  it('todos sus iconos existen y son PNG con el tamaño declarado', () => {
    for (const icon of manifest.icons.filter((i: any) => i.type === 'image/png')) {
      const file = path.join(publicDir, icon.src);
      const buf = fs.readFileSync(file);
      expect(buf.subarray(1, 4).toString()).toBe('PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(buf.readUInt32BE(16)).toBe(w);
      expect(buf.readUInt32BE(20)).toBe(h);
    }
    expect(fs.existsSync(path.join(publicDir, 'icons/apple-touch-icon.png'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'favicon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'favicon.ico'))).toBe(true);
  });

  it('index.html lo enlaza, con theme-color y viewport-fit=cover', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../client/index.html'), 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('rel="icon"');
  });
});

// El servidor sirve client/dist: estas pruebas solo aplican si el cliente está compilado (`npm run build`).
describe.skipIf(!fs.existsSync(path.join(distDir, 'manifest.webmanifest')))('servidor: ficheros de la PWA', () => {
  let stop: () => Promise<void>;
  const c = new Client();
  beforeAll(async () => { ({ stop } = await startTestApp()); });
  afterAll(async () => { await stop(); });

  it('sirve el manifiesto con su tipo MIME', async () => {
    const r = await c.get('/manifest.webmanifest');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/manifest\+json/);
  });

  it('sirve los iconos y el favicon', async () => {
    for (const [url, tipo] of [['/icons/icon-192.png', /image\/png/], ['/icons/apple-touch-icon.png', /image\/png/], ['/favicon.svg', /image\/svg\+xml/], ['/favicon.ico', /icon/]] as const) {
      const r = await c.get(url);
      expect(r.status, url).toBe(200);
      expect(r.headers['content-type'], url).toMatch(tipo);
    }
  });

  it('la CSP permite las imágenes propias y no abre scripts externos', async () => {
    const r = await c.get('/manifest.webmanifest');
    const csp = String(r.headers['content-security-policy']);
    expect(csp).toMatch(/img-src 'self'/);
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).toMatch(/default-src 'self'/); // manifiesto y service worker caen en 'self'
  });
});

// --- Service worker: se ejecuta en un contexto simulado y se comprueban sus reglas ---
function loadSw() {
  const listeners: Record<string, (e: any) => void> = {};
  const stores = new Map<string, Map<string, any>>();
  const cacheApi = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return { addAll: async (urls: string[]) => urls.forEach((u) => m.set(u, { url: u })), match: async (r: any) => m.get(typeof r === 'string' ? r : new URL(r.url).pathname), put: async () => {}, keys: async () => [], delete: async () => true };
    },
    match: async (r: any) => { for (const m of stores.values()) { const k = typeof r === 'string' ? r : new URL(r.url).pathname; if (m.has(k)) return m.get(k); } return undefined; },
    keys: async () => [...stores.keys()],
    delete: async (k: string) => stores.delete(k),
  };
  const self: any = { location: { origin: 'https://mar.test' }, addEventListener: (t: string, fn: any) => { listeners[t] = fn; }, skipWaiting: vi.fn(), clients: { claim: async () => {} } };
  const fetchMock = vi.fn().mockRejectedValue(new Error('sin red'));
  const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
  new Function('self', 'caches', 'fetch', 'URL', src)(self, cacheApi, fetchMock, URL);
  const fetchEvent = (url: string, init: { method?: string; mode?: string } = {}) => {
    const out: { responded: Promise<any> | null } = { responded: null };
    listeners.fetch({ request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'no-cors' }, respondWith: (p: any) => { out.responded = Promise.resolve(p); } });
    return out;
  };
  return { listeners, self, stores, fetchEvent, fetchMock };
}

describe('service worker (client/public/sw.js)', () => {
  it('precachea la página sin conexión al instalar', async () => {
    const sw = loadSw();
    await new Promise<void>((ok) => sw.listeners.install({ waitUntil: (p: Promise<any>) => p.then(() => ok()) }));
    const shell = [...sw.stores.entries()].find(([k]) => k.startsWith('mar-shell-'))!;
    expect(shell[1].has('/offline.html')).toBe(true);
  });

  it('nunca intercepta /api, ni peticiones que no sean GET, ni otros orígenes', () => {
    const sw = loadSw();
    expect(sw.fetchEvent('https://mar.test/api/library').responded).toBeNull();
    expect(sw.fetchEvent('https://mar.test/api/me', { method: 'POST' }).responded).toBeNull();
    expect(sw.fetchEvent('https://image.tmdb.org/t/p/w500/x.jpg').responded).toBeNull();
  });

  it('sin red, una navegación recibe la página sin conexión', async () => {
    const sw = loadSw();
    await new Promise<void>((ok) => sw.listeners.install({ waitUntil: (p: Promise<any>) => p.then(() => ok()) }));
    const ev = sw.fetchEvent('https://mar.test/mi-lista', { mode: 'navigate' });
    expect(ev.responded).not.toBeNull();
    expect(await ev.responded).toEqual({ url: '/offline.html' });
  });

  it('solo se activa la versión nueva cuando el cliente lo pide', () => {
    const sw = loadSw();
    sw.listeners.message({ data: 'otra cosa' });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    sw.listeners.message({ data: 'SKIP_WAITING' });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('al activarse borra las cachés de versiones antiguas y conserva las vigentes', async () => {
    const sw = loadSw();
    await sw.stores.set('mar-shell-vieja', new Map());
    await sw.stores.set('mar-assets', new Map());
    await new Promise<void>((ok) => sw.listeners.install({ waitUntil: (p: Promise<any>) => p.then(() => ok()) }));
    await new Promise<void>((ok) => sw.listeners.activate({ waitUntil: (p: Promise<any>) => p.then(() => ok()) }));
    expect(sw.stores.has('mar-shell-vieja')).toBe(false);
    expect(sw.stores.has('mar-assets')).toBe(true);
  });
});

describe.skipIf(!fs.existsSync(path.join(distDir, 'sw.js')))('servidor: caché y service worker compilado', () => {
  let stop: () => Promise<void>;
  const c = new Client();
  beforeAll(async () => { ({ stop } = await startTestApp()); });
  afterAll(async () => { await stop(); });

  it('el sw.js compilado lleva un identificador de versión, no el marcador', () => {
    const src = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
    expect(src).not.toContain('__BUILD__');
    expect(src).toMatch(/const BUILD = '\d+\.\d+\.\d+-[a-z0-9]+'/);
  });

  it('sw.js, index.html, offline.html y el manifiesto se revalidan siempre', async () => {
    for (const url of ['/sw.js', '/index.html', '/offline.html', '/manifest.webmanifest', '/', '/ruta-de-la-app']) {
      const r = await c.get(url);
      expect(r.status, url).toBe(200);
      expect(r.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('los ficheros con hash de /assets son inmutables', async () => {
    const asset = fs.readdirSync(path.join(distDir, 'assets')).find((f) => f.endsWith('.js'))!;
    const r = await c.get('/assets/' + asset);
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('los iconos tienen caché de un día y /api nunca queda cacheada por esta regla', async () => {
    expect((await c.get('/icons/icon-192.png')).headers['cache-control']).toBe('public, max-age=86400');
    expect((await c.get('/api/health')).headers['cache-control'] ?? '').not.toMatch(/immutable/);
  });
});
