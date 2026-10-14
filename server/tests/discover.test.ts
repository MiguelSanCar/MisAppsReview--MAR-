import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { Client, startTestApp } from './client';

let app: Awaited<ReturnType<typeof startTestApp>>;
const ana = new Client();

beforeAll(async () => {
  app = await startTestApp();
  await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' });
});
afterAll(() => app.stop());

/** El TMDB simulado repite en el resumen de cada resultado los parámetros que recibió. */
const echo = (r: any) => JSON.parse(r.body.results[0].synopsis);

describe('GET /api/discover (búsqueda avanzada)', () => {
  it('sin filtros devuelve series por popularidad, de la región configurada, con 10 resultados por página', async () => {
    const r = await ana.get('/api/discover');
    expect(r.status).toBe(200);
    expect(r.body.results).toHaveLength(10);
    expect(r.body.results.every((i: any) => i.type === 'serie')).toBe(true);
    expect(r.body.page).toBe(1);
    expect(r.body.totalPages).toBe(3);
    expect(r.body.hasMore).toBe(true);
    expect(echo(r)).toMatchObject({ sort_by: 'popularity.desc', watch_region: 'ES', include_adult: 'false', page: '1' });
    expect(echo(r).with_genres).toBeUndefined();
  });

  it('cada filtro llega a TMDB con su parámetro (plataforma, género, estudio, años, nota, orden)', async () => {
    const r = await ana.get('/api/discover?type=pelicula&platform=8&genre=28&studio=420&yearFrom=2015&yearTo=2020&minRating=7&sort=rating');
    expect(r.status).toBe(200);
    expect(r.body.results.every((i: any) => i.type === 'pelicula')).toBe(true);
    expect(echo(r)).toMatchObject({
      with_watch_providers: '8', with_genres: '28', with_companies: '420',
      'primary_release_date.gte': '2015-01-01', 'primary_release_date.lte': '2020-12-31',
      'vote_average.gte': '7', 'vote_count.gte': '150', sort_by: 'vote_average.desc',
    });
  });

  it('en series las fechas usan first_air_date', async () => {
    const r = await ana.get('/api/discover?type=serie&yearFrom=2010&sort=date');
    const p = echo(r);
    expect(p['first_air_date.gte']).toBe('2010-01-01');
    expect(p.sort_by).toBe('first_air_date.desc');
    expect(p['first_air_date.lte']).toMatch(/^\d{4}-\d{2}-\d{2}$/); // sin estrenos futuros
    expect(p['primary_release_date.gte']).toBeUndefined();
  });

  it('pagina: la página 2 trae otros resultados y la última no tiene más', async () => {
    const p1 = await ana.get('/api/discover?platform=8');
    const p2 = await ana.get('/api/discover?platform=8&page=2');
    const p3 = await ana.get('/api/discover?platform=8&page=3');
    const ids = (r: any) => r.body.results.map((i: any) => i.id);
    expect(ids(p2).filter((id: number) => ids(p1).includes(id))).toEqual([]);
    expect(p2.body.page).toBe(2);
    expect(p2.body.hasMore).toBe(true);
    expect(p3.body.results).toHaveLength(5);
    expect(p3.body.hasMore).toBe(false);
  });

  it('no mezcla anime de TMDB (lo cubre MyAnimeList) y guarda el contenido para poder marcarlo', async () => {
    const p1 = await ana.get('/api/discover?type=serie&platform=8');
    expect(p1.body.results.map((i: any) => i.title)).not.toContain('Anime en la búsqueda');
    const first = p1.body.results[0];
    expect((await ana.put(`/api/library/${first.id}/later`, { value: true })).status).toBe(200);
    const again = await ana.get('/api/discover?type=serie&platform=8');
    expect(again.body.states[first.id]).toMatchObject({ status: 'POR_VER' }); // el estado del usuario viaja con los resultados
  });

  it('valida los parámetros con mensajes claros', async () => {
    for (const q of ['type=anime', 'sort=raro', 'page=0', 'page=abc', 'genre=-3', 'minRating=15', 'minRating=0', 'yearFrom=1800', 'yearFrom=2020&yearTo=2010', 'platform=x']) {
      const r = await ana.get('/api/discover?' + q);
      expect(r.status, q).toBe(400);
      expect(typeof r.body.error, q).toBe('string');
    }
    expect((await ana.get('/api/discover?yearFrom=2020&yearTo=2010')).body.error).toMatch(/año inicial/);
  });

  it('exige sesión y avisa si falta la clave de TMDB', async () => {
    expect((await new Client().get('/api/discover')).status).toBe(401);
    const key = config.tmdbKey;
    config.tmdbKey = '';
    try {
      const r = await ana.get('/api/discover?platform=1');
      expect(r.status).toBe(503);
      expect(r.body.error).toMatch(/TMDB_API_KEY/);
    } finally {
      config.tmdbKey = key;
    }
  });
});

describe('listas para los filtros', () => {
  it('plataformas de la región, ordenadas por importancia', async () => {
    const r = await ana.get('/api/discover/providers?type=serie');
    expect(r.status).toBe(200);
    expect(r.body.providers.map((p: any) => p.name)).toEqual(['Netflix', 'HBO Max', 'Amazon Prime Video']);
    expect(r.body.providers[0]).toEqual({ id: 8, name: 'Netflix' });
  });

  it('géneros de series o de películas, por orden alfabético', async () => {
    const tv = (await ana.get('/api/discover/genres?type=serie')).body.genres.map((g: any) => g.name);
    const mv = (await ana.get('/api/discover/genres?type=pelicula')).body.genres.map((g: any) => g.name);
    expect(tv).toContain('Drama');
    expect(mv).toContain('Terror');
    expect(tv).toEqual([...tv].sort((a, b) => a.localeCompare(b, 'es')));
    expect((await ana.get('/api/discover/genres?type=anime')).status).toBe(400);
  });

  it('busca estudios por nombre', async () => {
    const r = await ana.get('/api/discover/studios?q=' + encodeURIComponent('marvel'));
    expect(r.body.studios).toEqual([{ id: 420, name: 'Marvel Studios' }]);
    expect((await ana.get('/api/discover/studios?q=a')).status).toBe(400);
    expect((await ana.get('/api/discover/studios?q=' + 'x'.repeat(61))).status).toBe(400);
    expect((await ana.get('/api/discover/studios')).status).toBe(400);
  });

  it('todas exigen sesión', async () => {
    for (const u of ['/api/discover/providers', '/api/discover/genres', '/api/discover/studios?q=pixar']) {
      expect((await new Client().get(u)).status, u).toBe(401);
    }
  });
});
