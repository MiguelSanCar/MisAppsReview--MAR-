import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/db';
import { cleanDate, isFuture, watchableEpisodes } from '../src/domain/release';
import { Client, startTestApp } from './client';

describe('estrenos: reglas puras', () => {
  it('fechas y futuro', () => {
    expect(cleanDate('2026-10-16')).toBe('2026-10-16');
    expect(cleanDate('2026')).toBeNull();
    expect(cleanDate(null)).toBeNull();
    expect(isFuture('2026-10-17', '2026-10-16')).toBe(true);
    expect(isFuture('2026-10-16', '2026-10-16')).toBe(false); // hoy ya está estrenado
    expect(isFuture(null, '2026-10-16')).toBe(false); // sin dato no se bloquea
  });

  it('episodios que se pueden ver', () => {
    const seasons = [{ number: 1, episodes: 8, air: '2020-01-01' }, { number: 2, episodes: 10, air: '2099-01-01' }, { number: 3, episodes: 6 }];
    expect(watchableEpisodes({ unreleased: true, total: 24, seasons }, '2026-10-16')).toBe(0);
    expect(watchableEpisodes({ unreleased: false, total: 24, seasons }, '2026-10-16')).toBe(14);
    expect(watchableEpisodes({ unreleased: false, total: 24, seasons: [{ number: 1, episodes: 24 }] }, '2026-10-16')).toBe(24);
    expect(watchableEpisodes({ unreleased: false, total: null, seasons: null }, '2026-10-16')).toBeNull();
  });
});

describe('estrenos: API', () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  const ana = new Client();
  let peli: any;
  let serie: any;
  const setRelease = (id: number, d: string | null) => run('UPDATE content SET release_date = ? WHERE id = ?', [d, id]);

  beforeAll(async () => {
    app = await startTestApp();
    await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' });
    const res = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
    peli = res.find((x: any) => x.externalId === 'movie-101');
    serie = res.find((x: any) => x.title === 'Breaking Bad');
    await ana.get(`/api/content/${serie.id}`); // completa la ficha y sus temporadas
    await ana.get(`/api/content/${peli.id}`);
  });
  afterAll(() => app.stop());

  it('una película con estreno futuro solo admite «Por ver»', async () => {
    setRelease(peli.id, '2099-01-01');
    const c = (await ana.get(`/api/content/${peli.id}`)).body.content;
    expect(c).toMatchObject({ unreleased: true, releaseDate: '2099-01-01', watchable: 0 });
    for (const status of ['VIENDO', 'FINALIZADO', 'DEJADO']) expect((await ana.put(`/api/library/${peli.id}/status`, { status })).status).toBe(409);
    expect((await ana.put(`/api/library/${peli.id}/favorite`, { value: true })).status).toBe(409);
    expect((await ana.put(`/api/library/${peli.id}/episodes`, { watched: 1 })).status).toBe(409);
    expect((await ana.put(`/api/library/${peli.id}/status`, { status: 'POR_VER' })).status).toBe(200);
    expect((await ana.put(`/api/library/${peli.id}/later`, { value: true })).status).toBe(200);
  });

  it('al estrenarse (fecha pasada) recupera todos los estados', async () => {
    setRelease(peli.id, '2020-01-01');
    expect((await ana.get(`/api/content/${peli.id}`)).body.content.unreleased).toBe(false);
    expect((await ana.put(`/api/library/${peli.id}/status`, { status: 'FINALIZADO' })).status).toBe(200);
  });

  it('en una serie con una temporada por estrenar no se marcan sus episodios; Finalizado llega hasta lo estrenado', async () => {
    const seasons = JSON.parse((await import('../src/db')).get<{ seasons: string }>('SELECT seasons FROM content WHERE id = ?', [serie.id])!.seasons);
    seasons[4].air = '2099-01-01'; // la temporada 5 (16 episodios) aún no ha salido
    run('UPDATE content SET seasons = ? WHERE id = ?', [JSON.stringify(seasons), serie.id]);
    const c = (await ana.get(`/api/content/${serie.id}`)).body.content;
    expect(c).toMatchObject({ unreleased: false, watchable: 46, totalEpisodes: 62 });
    expect((await ana.put(`/api/library/${serie.id}/episodes`, { watched: 47 })).status).toBe(409);
    expect((await ana.put(`/api/library/${serie.id}/episodes`, { watched: 46 })).body.state).toMatchObject({ watched: 46, status: 'VIENDO' });
    const fin = await ana.put(`/api/library/${serie.id}/status`, { status: 'FINALIZADO' });
    expect(fin.body.state).toMatchObject({ status: 'FINALIZADO', watched: 46 });
  });

  it('una serie sin estrenar tampoco admite estados', async () => {
    setRelease(serie.id, '2099-06-01');
    expect((await ana.put(`/api/library/${serie.id}/status`, { status: 'VIENDO' })).status).toBe(409);
  });
});
