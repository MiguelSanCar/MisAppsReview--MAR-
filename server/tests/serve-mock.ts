/**
 * Servidor de PRUEBAS: app completa en memoria con TMDB/Jikan/OMDb simulados (títulos falsos).
 * No usar para datos reales. Uso: npm run dev:mock -w server  (puerto 3101, sirve client/dist si existe).
 */
import { createApp } from '../src/app';
import { config } from '../src/config';
import { openDb } from '../src/db';
import { startMockProviders } from './mock-providers';

async function main() {
  await openDb(null);
  const mock = await startMockProviders();
  Object.assign(config, {
    tmdbBase: `${mock.base}/tmdb`, jikanBase: `${mock.base}/jikan`, omdbBase: `${mock.base}/omdb`,
    tmdbKey: 'tmdb-key', omdbKey: 'omdb-key', jikanMinGapMs: 0, authRateLimit: 100_000,
    clientOrigin: 'http://localhost:3101',
  });
  const port = Number(process.env.MOCK_PORT) || 3101;
  createApp().listen(port, () => console.log(`Servidor simulado en http://localhost:${port}`));
}

main();
