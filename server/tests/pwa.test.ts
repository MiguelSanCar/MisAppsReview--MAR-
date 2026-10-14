import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
