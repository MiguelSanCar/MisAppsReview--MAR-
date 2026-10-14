import initSqlJs from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { get, run } from '../src/db';
import { episodeLocation, normalizeSeasons, parseSeasons, seasonsFinished, seasonsWatchedOf } from '../src/domain/seasons';
import { MIGRATIONS } from '../src/migrations';
import { Client, startTestApp } from './client';

const S = (...eps: number[]) => eps.map((episodes, i) => ({ number: i + 1, episodes }));

describe('temporadas (reglas puras)', () => {
  it('lee el JSON guardado y distingue «sin consultar» de «sin datos»', () => {
    expect(parseSeasons(null)).toBeNull();
    expect(parseSeasons('[]')).toEqual([]);
    expect(parseSeasons('[{"number":1,"episodes":7},{"number":2,"episodes":13}]')).toEqual(S(7, 13));
    expect(parseSeasons('basura')).toBeNull();
    expect(parseSeasons('{"a":1}')).toBeNull();
    expect(parseSeasons('[{"number":0,"episodes":3},{"number":1,"episodes":0},{"number":2,"episodes":5}]')).toEqual([{ number: 2, episodes: 5 }]); // sin especiales ni temporadas vacías
  });

  it('ajusta la estructura al total de episodios de la serie', () => {
    expect(normalizeSeasons(S(7, 13), 20)).toEqual(S(7, 13)); // coincide
    expect(normalizeSeasons(S(7, 13), 25)).toEqual(S(7, 18)); // faltan 5: se añaden a la última
    expect(normalizeSeasons(S(7, 13, 10), 22)).toEqual(S(7, 13, 2)); // sobran 8: se recortan del final
    expect(normalizeSeasons(S(7, 13, 10), 20)).toEqual(S(7, 13)); // la última desaparece entera
    expect(normalizeSeasons(S(7, 13), null)).toEqual(S(7, 13)); // sin total, se respeta
    expect(normalizeSeasons([], 10)).toBeNull();
    expect(normalizeSeasons(null, 10)).toBeNull();
    expect(normalizeSeasons([{ number: 2, episodes: 4 }, { number: 1, episodes: 3 }], 7)).toEqual([{ number: 1, episodes: 3 }, { number: 2, episodes: 4 }]); // ordenadas
    // la suma siempre coincide con el total
    for (const total of [1, 5, 19, 20, 21, 40]) {
      expect(normalizeSeasons(S(7, 13), total)!.reduce((n, s) => n + s.episodes, 0)).toBe(total);
    }
  });

  it('cuenta las temporadas completas según los episodios vistos', () => {
    const s = S(7, 13, 13);
    expect([0, 1, 6, 7, 8, 19, 20, 32, 33, 100].map((n) => seasonsFinished(s, n))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 3, 3]);
    expect(seasonsFinished(null, 50)).toBe(0);
  });

  it('localiza un episodio en su temporada', () => {
    const s = S(7, 13);
    expect(episodeLocation(s, 1)).toEqual({ season: 1, episode: 1 });
    expect(episodeLocation(s, 7)).toEqual({ season: 1, episode: 7 });
    expect(episodeLocation(s, 8)).toEqual({ season: 2, episode: 1 });
    expect(episodeLocation(s, 20)).toEqual({ season: 2, episode: 13 });
    expect(episodeLocation(s, 21)).toBeNull();
  });

  it('temporadas vistas de un contenido: con estructura, sin ella, revisionado y películas', () => {
    const base = { status: 'VIENDO', watched: 0, previous: 0, seasons: S(7, 13) };
    expect(seasonsWatchedOf({ ...base, type: 'serie', watched: 7 })).toBe(1);
    expect(seasonsWatchedOf({ ...base, type: 'serie', watched: 19 })).toBe(1);
    expect(seasonsWatchedOf({ ...base, type: 'serie', watched: 20 })).toBe(2);
    expect(seasonsWatchedOf({ ...base, type: 'serie', watched: 3, previous: 20 })).toBe(2); // reviendo: ya vio todo una vez
    expect(seasonsWatchedOf({ ...base, type: 'serie', status: 'FINALIZADO', watched: 20 })).toBe(2);
    // sin estructura: terminada = 1; en curso = 0
    expect(seasonsWatchedOf({ type: 'anime', status: 'FINALIZADO', watched: 220, previous: 0, seasons: null })).toBe(1);
    expect(seasonsWatchedOf({ type: 'serie', status: 'VIENDO', watched: 10, previous: 0, seasons: null })).toBe(0);
    expect(seasonsWatchedOf({ type: 'serie', status: 'VIENDO', watched: 2, previous: 30, seasons: null })).toBe(1); // revisionado
    expect(seasonsWatchedOf({ type: 'pelicula', status: 'FINALIZADO', watched: 1, previous: 0, seasons: null })).toBe(0);
  });
});

describe('temporadas en la API', () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  const ana = new Client();
  const beto = new Client();
  let bb: any;
  let naruto: any;
  let peli: any;

  const stats = async (c = ana) => (await c.get('/api/me/profile')).body.stats;

  beforeAll(async () => {
    app = await startTestApp();
    await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' });
    await beto.post('/api/auth/register', { username: 'beto', email: 'beto@test.com', password: 'secreto123' });
    const res = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
    bb = res.find((x: any) => x.title === 'Breaking Bad');
    peli = res.find((x: any) => x.type === 'pelicula');
    naruto = (await ana.get('/api/search?q=naruto&type=anime')).body.results.find((x: any) => x.title === 'Naruto');
  });
  afterAll(() => app.stop());

  it('la ficha de una serie trae sus temporadas (sin especiales) y su suma coincide con el total', async () => {
    const r = await ana.get(`/api/content/${bb.id}`);
    expect(r.status).toBe(200);
    expect(r.body.content.seasons).toEqual(S(7, 13, 13, 13, 16));
    expect(r.body.content.seasons.reduce((n: number, s: any) => n + s.episodes, 0)).toBe(r.body.content.totalEpisodes);
  });

  it('películas y anime no tienen estructura de temporadas', async () => {
    expect((await ana.get(`/api/content/${peli.id}`)).body.content.seasons).toBeNull();
    expect((await ana.get(`/api/content/${naruto.id}`)).body.content.seasons).toBeNull();
  });

  it('completa las temporadas de series guardadas antes de existir la columna', async () => {
    run('UPDATE content SET seasons = NULL WHERE id = ?', [bb.id]);
    const r = await ana.get(`/api/content/${bb.id}`);
    expect(r.body.content.seasons).toEqual(S(7, 13, 13, 13, 16));
    expect(JSON.parse(get<{ seasons: string }>('SELECT seasons FROM content WHERE id = ?', [bb.id])!.seasons)).toEqual(S(7, 13, 13, 13, 16));
  });

  it('el progreso por episodios marca las temporadas vistas en el perfil', async () => {
    expect((await stats()).seasonsWatched).toBe(0);
    await ana.put(`/api/library/${bb.id}/status`, { status: 'VIENDO' });
    for (const [watched, seasons] of [[6, 0], [7, 1], [19, 1], [20, 2], [45, 3], [61, 4], [62, 5]] as const) {
      const r = await ana.put(`/api/library/${bb.id}/episodes`, { watched });
      expect(r.status).toBe(200);
      expect((await stats()).seasonsWatched, `${watched} episodios`).toBe(seasons);
    }
    expect((await ana.get(`/api/library?status=FINALIZADO`)).body.items.map((i: any) => i.id)).toContain(bb.id); // 62 de 62 = finalizada
  });

  it('un anime o una serie terminados sin estructura cuentan como una temporada; las películas, ninguna', async () => {
    const antes = (await stats()).seasonsWatched;
    await ana.put(`/api/library/${naruto.id}/status`, { status: 'FINALIZADO' });
    expect((await stats()).seasonsWatched).toBe(antes + 1);
    await ana.put(`/api/library/${peli.id}/status`, { status: 'FINALIZADO' });
    expect((await stats()).seasonsWatched).toBe(antes + 1);
  });

  it('al volver a ver una serie, las temporadas ya vistas se conservan', async () => {
    const antes = (await stats()).seasonsWatched;
    const r = await ana.post(`/api/library/${bb.id}/rewatch`);
    expect(r.status).toBe(200);
    expect((await stats()).seasonsWatched).toBe(antes);
  });

  it('borrar el contenido las quita de las estadísticas', async () => {
    const antes = (await stats()).seasonsWatched;
    await ana.del(`/api/library/${bb.id}`);
    expect((await stats()).seasonsWatched).toBe(antes - 5);
  });

  it('aparece en el perfil de otras personas y en la comparación', async () => {
    await ana.put(`/api/library/${bb.id}/status`, { status: 'VIENDO' });
    await ana.put(`/api/library/${bb.id}/episodes`, { watched: 20 });
    const tok = (await beto.post('/api/invites/mine')).body.token;
    await ana.post(`/api/invites/${tok}/accept`);
    const p = await ana.get('/api/profiles/beto');
    expect(p.body.stats.seasonsWatched).toBe(0);
    const mine = await beto.get('/api/profiles/ana');
    expect(mine.body.stats.seasonsWatched).toBe(2 + 1); // 2 de Breaking Bad + 1 del anime terminado
    const cmp = await ana.get('/api/profiles/beto/compare');
    const row = cmp.body.rows.find((r: any) => r.key === 'seasons');
    expect(row).toMatchObject({ label: 'Temporadas vistas', me: 3, them: 0, winner: 'me' });
  });
});

describe('migración 12', () => {
  it('añade la columna sin tocar lo existente', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    MIGRATIONS.filter((m) => m.version <= 11).forEach((m) => db.exec(m.sql));
    db.run("INSERT INTO content (source, external_id, type, title) VALUES ('tmdb','tv-1','serie','Vieja')");
    db.exec(MIGRATIONS.find((m) => m.version === 12)!.sql);
    expect(db.exec("SELECT title, seasons FROM content")[0].values[0]).toEqual(['Vieja', null]);
  });
});
