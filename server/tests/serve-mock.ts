/**
 * Servidor de PRUEBAS: app completa en memoria con TMDB/Jikan/OMDb simulados (títulos falsos).
 * No usar para datos reales. Uso: npm run dev:mock -w server  (puerto 3101, sirve client/dist si existe).
 */
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { openDb, run } from '../src/db';
import { startMockProviders } from './mock-providers';

/** MOCK_SEED=300: crea el usuario «carga» (contraseña Prueba-12345) con N contenidos, para medir listas largas. */
function seedLongList(n: number) {
  const { lastId: uid } = run('INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)', ['carga', 'carga@test.com', bcrypt.hashSync('Prueba-12345', 10), new Date().toISOString()]);
  const types = ['serie', 'pelicula', 'anime'];
  const states = ['POR_VER', 'VIENDO', 'FINALIZADO', 'DEJADO'];
  for (let i = 0; i < n; i++) {
    const { lastId } = run('INSERT INTO content (source, external_id, type, title, year, total_episodes) VALUES (?, ?, ?, ?, ?, ?)', ['tmdb', `tv-seed-${i}`, types[i % 3], `Contenido de prueba ${String(i).padStart(3, '0')}`, 1990 + (i % 35), 12]);
    run('INSERT INTO user_content (user_id, content_id, status, watched_episodes, is_favorite, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [uid, lastId, states[i % 4], i % 4 === 2 ? 12 : 0, i % 25 === 0 ? 1 : 0, new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString()]);
  }
}

async function main() {
  await openDb(null);
  if (Number(process.env.MOCK_SEED) > 0) seedLongList(Number(process.env.MOCK_SEED));
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
