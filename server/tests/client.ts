import http from 'http';
import type { AddressInfo } from 'net';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { closeDb, openDb } from '../src/db';
import { drainNews, resetNewsState } from '../src/news';
import { startMockProviders } from './mock-providers';

/** Cliente HTTP mínimo con "cookie jar" (una sesión por instancia). */
export class Client {
  static port = 0;
  cookie = '';
  async req(method: string, path: string, body?: unknown) {
    return new Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const r = http.request(
        {
          host: '127.0.0.1', port: Client.port, method, path,
          headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const set = res.headers['set-cookie']?.find((c) => c.startsWith('mar_token='));
            if (set) this.cookie = set.split(';')[0] === 'mar_token=' ? '' : set.split(';')[0];
            let parsed: any = null;
            try { parsed = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* sin JSON */ }
            resolve({ status: res.statusCode!, body: parsed, headers: res.headers });
          });
        },
      );
      r.on('error', reject);
      if (data) r.write(data);
      r.end();
    });
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  put = (p: string, b?: unknown) => this.req('PUT', p, b ?? {});
  del = (p: string) => this.req('DELETE', p);
}

/** Arranca app + proveedores simulados con BD en memoria. Devuelve la función para apagarlo todo. */
export async function startTestApp() {
  await openDb(null);
  resetNewsState();
  const mock = await startMockProviders();
  Object.assign(config, {
    tmdbBase: `${mock.base}/tmdb`, jikanBase: `${mock.base}/jikan`, omdbBase: `${mock.base}/omdb`,
    tmdbKey: 'tmdb-key', omdbKey: 'omdb-key', jikanMinGapMs: 0, authRateLimit: 10_000, jointHistoryLimit: 15,
  });
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  Client.port = (server.address() as AddressInfo).port;
  return { mock, stop: async () => { await drainNews(); server.close(); await mock.close(); closeDb(); } };
}
