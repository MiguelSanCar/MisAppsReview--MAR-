/**
 * Servidor de PRUEBAS: app completa en memoria con TMDB/MyAnimeList/OMDb simulados (títulos falsos).
 * No usar para datos reales. Uso: npm run dev:mock -w server  (puerto 3101, sirve client/dist si existe).
 *
 * Variables opcionales:
 *  - MOCK_PORT: puerto (3101 por defecto).
 *  - MOCK_SEED=300: crea el usuario «carga» (contraseña Prueba-12345) con N contenidos, para medir listas largas.
 *  - Control de TMDB simulado (solo aquí): `POST /__mock/state` con un JSON parcial (extraSeasons, status, collections,
 *    movieSearch, delayMs) cambia lo que «devuelve TMDB», para probar las notificaciones de novedades en el navegador.
 *    Las novedades se calculan sin esperas (caducidades a 0) para poder verlas al momento.
 *  - MOCK_DEMO=1: modo demostración para capturas de pantalla: títulos conocidos con carátulas SVG generadas, y los
 *    usuarios «demo» y «lucia» (contraseña Prueba-12345), amigos entre sí, con listas variadas.
 */
import http from 'http';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { openDb, run } from '../src/db';
import { DEMO, DemoTitle, posterSvg } from './demo-data';
import { startMockProviders } from './mock-providers';

const PASSWORD = 'Prueba-12345';
const iso = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * 3_600_000).toISOString();
const newUser = (name: string) =>
  run('INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)', [name, `${name}@test.com`, bcrypt.hashSync(PASSWORD, 10), '2026-08-20T10:00:00.000Z']).lastId;

function seedLongList(n: number) {
  const uid = newUser('carga');
  const types = ['serie', 'pelicula', 'anime'];
  const states = ['POR_VER', 'VIENDO', 'FINALIZADO', 'DEJADO'];
  for (let i = 0; i < n; i++) {
    const { lastId } = run('INSERT INTO content (source, external_id, type, title, year, total_episodes, detailed_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['tmdb', `tv-seed-${i}`, types[i % 3], `Contenido de prueba ${String(i).padStart(3, '0')}`, 1990 + (i % 35), 12, '2026-01-01T00:00:00.000Z']); // ya detallado: avanzar su estado no pide la ficha a TMDB
    run('INSERT INTO user_content (user_id, content_id, status, watched_episodes, is_favorite, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [uid, lastId, states[i % 4], i % 4 === 2 ? 12 : 0, i % 25 === 0 ? 1 : 0, new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString()]);
  }
}

/** Contenidos y usuarios de demostración (todo ya «detallado»: no se pide nada a TMDB para mostrarlos). */
function seedDemo(origin: string) {
  const ids = new Map<number, number>();
  for (const t of DEMO) {
    const total = t.kind === 'tv' ? (t.seasons ?? []).reduce((a, b) => a + b, 0) : 1;
    const { lastId } = run(
      `INSERT INTO content (source, external_id, type, title, poster_url, synopsis, year, total_episodes, runtime_minutes, studio, genres, seasons, detailed_at)
       VALUES ('tmdb', ?, ?, ?, ?, ?, ?, ?, ?, 'Estudio de muestra', ?, ?, '2026-09-01T00:00:00.000Z')`,
      [`${t.kind}-${t.id}`, t.kind === 'tv' ? 'serie' : 'pelicula', t.title, `${origin}/__posters/${t.id}.svg`, t.overview, t.year, total, t.kind === 'tv' ? 50 : 115, JSON.stringify(t.genres), t.kind === 'tv' ? JSON.stringify(t.seasons!.map((e, i) => ({ number: i + 1, episodes: e }))) : null],
    );
    ids.set(t.id, lastId);
  }
  const eps = (t: DemoTitle) => (t.seasons ?? [1]).reduce((a, b) => a + b, 0);
  // [id, estado, episodios vistos (null = todos), favorito]
  type Row = [number, string, number | null, number];
  const lists: Record<string, Row[]> = {
    demo: [
      [1396, 'FINALIZADO', null, 1], [70523, 'FINALIZADO', null, 1], [87108, 'FINALIZADO', null, 0], [60059, 'FINALIZADO', null, 0],
      [27205, 'FINALIZADO', null, 1], [496243, 'FINALIZADO', null, 1], [157336, 'FINALIZADO', null, 0], [238, 'FINALIZADO', null, 0],
      [95396, 'VIENDO', 11, 0], [136315, 'VIENDO', 14, 0], [66732, 'VIENDO', 12, 0], [126308, 'VIENDO', 6, 0],
      [76331, 'POR_VER', 0, 0], [106379, 'POR_VER', 0, 0], [438631, 'POR_VER', 0, 0], [872585, 'POR_VER', 0, 0], [569094, 'POR_VER', 0, 0],
      [42009, 'DEJADO', 5, 0], [76341, 'DEJADO', 1, 0],
    ],
    lucia: [
      [1396, 'FINALIZADO', null, 0], [97546, 'FINALIZADO', null, 1], [1668, 'FINALIZADO', null, 1], [120467, 'FINALIZADO', null, 1],
      [100088, 'FINALIZADO', null, 0], [603, 'FINALIZADO', null, 0], [66732, 'VIENDO', 20, 0], [94997, 'VIENDO', 7, 0],
      [136315, 'POR_VER', 0, 0], [1399, 'DEJADO', 12, 0],
    ],
  };
  const users: Record<string, number> = {};
  for (const [name, rows] of Object.entries(lists)) {
    users[name] = newUser(name);
    rows.forEach(([id, status, watched, fav], i) => {
      const t = DEMO.find((x) => x.id === id)!;
      run('INSERT INTO user_content (user_id, content_id, status, watched_episodes, is_favorite, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [users[name], ids.get(id)!, status, watched ?? eps(t), fav, iso(rows.length - i)]);
    });
  }
  run("INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'accepted', '2026-09-05T10:00:00.000Z')", [users.demo, users.lucia]);
  run('UPDATE users SET profile_public = 1, share_list = 1 WHERE id = ?', [users.lucia]);
}

async function main() {
  await openDb(null);
  const demo = process.env.MOCK_DEMO === '1';
  const port = Number(process.env.MOCK_PORT) || 3101;
  const origin = `http://localhost:${port}`;
  if (Number(process.env.MOCK_SEED) > 0) seedLongList(Number(process.env.MOCK_SEED));
  const mock = await startMockProviders({ demo });
  Object.assign(config, {
    tmdbBase: `${mock.base}/tmdb`, malBase: `${mock.base}/mal`, omdbBase: `${mock.base}/omdb`,
    tmdbKey: 'tmdb-key', omdbKey: 'omdb-key', malClientId: 'mal-client', malMinGapMs: 0, authRateLimit: 100_000,
    clientOrigin: origin,
    ...(demo ? { tmdbImageBase: `${origin}/__posters` } : {}),
  });
  if (demo) seedDemo(origin);
  Object.assign(config, { newsUserIntervalMs: 0, newsTtlActiveMs: 0, newsTtlIdleMs: 0, newsRelatedTtlMs: 0, newsRoundDelayMs: 500 });
  const app = createApp();
  const server = http.createServer((req, res) => {
    // Carátulas generadas del modo demo (mismo origen que la app: la CSP las admite)
    const m = demo ? /^\/__posters\/(\d+)\.svg/.exec(req.url ?? '') : null;
    const t = m && DEMO.find((x) => x.id === Number(m[1]));
    if (t) { res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' }); res.end(posterSvg(t)); return; }
    if (req.method === 'POST' && req.url === '/__mock/state') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try { Object.assign(mock.state, JSON.parse(body || '{}')); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }
        catch { res.writeHead(400); res.end('{"error":"JSON no válido"}'); }
      });
      return;
    }
    app(req, res);
  });
  server.listen(port, () => console.log(`Servidor simulado${demo ? ' (modo demo)' : ''} en ${origin}`));
}

main();
