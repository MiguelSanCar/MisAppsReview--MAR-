import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { get } from '../src/db';
import { applySample, averageOf, hasRuntimes, minutesOfFirst, needsRuntimes, planSample } from '../src/domain/runtimes';
import { parseSeasons } from '../src/domain/seasons';
import { runtimesIdle } from '../src/runtimes';
import { Client, startTestApp } from './client';

const S = (number: number, episodes: number, minutes?: number) => (minutes === undefined ? { number, episodes } : { number, episodes, minutes });

describe('duración de episodios: reglas puras', () => {
  it('plan: las temporadas largas (más de 3N) se piden una a una; las cortas aportan una muestra común de N episodios', () => {
    // N = 4 → larga = más de 12 episodios
    expect(planSample([S(1, 7), S(2, 13), S(3, 13), S(4, 6), S(5, 16)], 4, 12)).toEqual({ own: [2, 3, 5], shared: [1] });
    // si la primera corta no llega a N episodios se toma también la siguiente
    expect(planSample([S(1, 2), S(2, 3), S(3, 5)], 4, 12)).toEqual({ own: [], shared: [1, 2] });
    // serie entera de temporadas cortas: solo se consulta lo justo para reunir N episodios
    expect(planSample([S(1, 10), S(2, 10), S(3, 10), S(4, 10)], 4, 12)).toEqual({ own: [], shared: [1] });
  });

  it('plan: el límite de peticiones por serie recorta las temporadas largas, no la muestra común', () => {
    const long = Array.from({ length: 30 }, (_, i) => S(i + 1, 24));
    const p = planSample(long, 4, 12);
    expect(p.own).toHaveLength(12);
    expect(p.shared).toEqual([]);
    const mixed = planSample([S(1, 5), ...Array.from({ length: 20 }, (_, i) => S(i + 2, 24))], 4, 12);
    expect(mixed.shared).toEqual([1]);
    expect(mixed.own).toHaveLength(11);
  });

  it('media de los primeros N con duración conocida', () => {
    expect(averageOf([40, 42, 44, 46, 100], 4)).toBe(43);
    expect(averageOf([null, 40, null, 44, 90], 4)).toBe(42); // ignora los desconocidos dentro de los N
    expect(averageOf([null, 0], 4)).toBeNull();
    expect(averageOf([], 4)).toBeNull();
  });

  it('cada temporada larga con su media; las cortas comparten la de la muestra; lo que falta, la media de lo medido', () => {
    const seasons = [S(1, 7), S(2, 13), S(3, 13), S(4, 20), S(5, 8)];
    const out = applySample(seasons, 4, new Map([[2, [40, 40, 40, 40]], [3, [50, 50, 50, 50]]]), [30, 30, 30, 30]);
    expect(out.map((s) => s.minutes)).toEqual([30, 40, 50, 40, 30]); // la 4 (larga sin consultar) usa la media de 30, 40 y 50
    expect(out.every((s, i) => s.number === seasons[i].number && s.episodes === seasons[i].episodes)).toBe(true);
    // sin ningún dato: 0 («consultado sin datos»)
    expect(applySample(seasons, 4, new Map(), []).map((s) => s.minutes)).toEqual([0, 0, 0, 0, 0]);
  });

  it('minutos de los primeros N episodios, con respaldo y varias vueltas', () => {
    const seasons = [S(1, 10, 40), S(2, 10, 50), S(3, 10, 0)];
    expect(minutesOfFirst(seasons, 0, 45)).toBe(0);
    expect(minutesOfFirst(seasons, 5, 45)).toBe(200);
    expect(minutesOfFirst(seasons, 15, 45)).toBe(400 + 250);
    expect(minutesOfFirst(seasons, 30, 45)).toBe(400 + 500 + 450); // la 3 no tiene datos: respaldo
    expect(minutesOfFirst(seasons, 35, 45)).toBe(400 + 500 + 450 + 200); // segunda vuelta
  });

  it('estado de las medias', () => {
    expect(needsRuntimes([S(1, 5)])).toBe(true);
    expect(needsRuntimes([S(1, 5, 0)])).toBe(false);
    expect(needsRuntimes(null)).toBe(false);
    expect(hasRuntimes([S(1, 5, 0)])).toBe(false);
    expect(hasRuntimes([S(1, 5, 0), S(2, 5, 30)])).toBe(true);
    expect(parseSeasons('[{"number":1,"episodes":5,"minutes":42},{"number":2,"episodes":3}]')).toEqual([S(1, 5, 42), S(2, 3)]);
  });
});

describe('duración de episodios: relleno y estadísticas', () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  const ana = new Client();
  let bb: any;
  const seasonCalls = () => app.mock.calls.filter((c) => /\/tmdb\/tv\/\d+\/season\/\d+$/.test(c));
  const stats = async () => (await ana.get('/api/me/profile')).body.stats;
  const savedSeasons = (id: number) => parseSeasons(get<{ seasons: string }>('SELECT seasons FROM content WHERE id = ?', [id])!.seasons)!;

  beforeAll(async () => {
    app = await startTestApp();
    config.useRealRuntime = true;
    config.runtimeSample = 4;
    await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' });
    bb = (await ana.get('/api/search?q=prueba&type=todo')).body.results.find((x: any) => x.title === 'Breaking Bad');
  });
  afterAll(() => app.stop());

  it('al abrir la ficha, las medias se calculan en segundo plano y la petición no espera', async () => {
    app.mock.state.delayMs = 30; // cada respuesta de TMDB tarda 30 ms: 5 temporadas no pueden estar en el camino de la petición
    const t0 = Date.now();
    const r = await ana.get(`/api/content/${bb.id}`);
    expect(r.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(2000);
    app.mock.state.delayMs = 0;
    await runtimesIdle();
    // N = 4: la temporada 1 (7 episodios) es corta → media de la muestra común; las demás (más de 12) tienen la suya
    expect(savedSeasons(bb.id).map((s) => s.minutes)).toEqual([42, 44, 46, 48, 50]);
    expect(seasonCalls()).toHaveLength(5);
  });

  it('no vuelve a pedir lo que ya tiene', async () => {
    await ana.get(`/api/content/${bb.id}`);
    await ana.get('/api/me/profile');
    await runtimesIdle();
    expect(seasonCalls()).toHaveLength(5);
  });

  it('las horas vistas suman los minutos reales de los episodios vistos', async () => {
    await ana.put(`/api/library/${bb.id}/episodes`, { watched: 10 });
    expect((await stats()).totalMinutes).toBe(7 * 42 + 3 * 44);
    await ana.put(`/api/library/${bb.id}/status`, { status: 'FINALIZADO' });
    const s = await stats();
    expect(s.episodes).toBe(62);
    expect(s.totalMinutes).toBe(7 * 42 + 13 * 44 + 13 * 46 + 13 * 48 + 16 * 50);
  });

  it('en una revisión se suman los minutos de los episodios revistos', async () => {
    await ana.post(`/api/library/${bb.id}/rewatch`);
    await ana.put(`/api/library/${bb.id}/episodes`, { watched: 7 });
    const s = await stats();
    expect(s.rewatches.episodes).toBe(7);
    expect(s.rewatches.totalMinutes).toBe(7 * 42);
    expect(s.totalMinutes).toBe(7 * 42 + 13 * 44 + 13 * 46 + 13 * 48 + 16 * 50 + 7 * 42);
  });

  it('con USE_REAL_RUNTIME=false se usa la duración fija', async () => {
    config.useRealRuntime = false;
    expect((await stats()).totalMinutes).toBe(69 * 50);
    config.useRealRuntime = true;
  });

  it('una serie sin datos de duración guarda 0 y usa la fija', async () => {
    const trend = (await ana.get('/api/search/trending?type=serie')).body;
    const other = (trend.results ?? trend.items)[0];
    app.mock.state.seasonRuntimes[`${other.externalId.split('-')[1]}:1`] = [null, null, null];
    await ana.get(`/api/content/${other.id}`);
    await runtimesIdle();
    expect(savedSeasons(other.id).map((s) => s.minutes)).toEqual([0]);
    const before = (await stats()).totalMinutes;
    await ana.put(`/api/library/${other.id}/status`, { status: 'FINALIZADO' });
    expect((await stats()).totalMinutes - before).toBe(5 * 50); // 5 episodios × la duración fija de serie
  });

  it('las series ya guardadas sin medias se completan desde el perfil', async () => {
    const serie = (await ana.get('/api/search?q=prueba&type=todo')).body.results.find((x: any) => x.title === 'Breaking Bad');
    expect(serie.id).toBe(bb.id);
    // se borran las medias como si la serie se hubiera guardado antes de existir esta función
    const { run } = await import('../src/db');
    run('UPDATE content SET seasons = ? WHERE id = ?', [JSON.stringify(savedSeasons(bb.id).map(({ number, episodes }) => ({ number, episodes }))), bb.id]);
    const before = seasonCalls().length;
    await ana.get('/api/me/profile'); // la respuesta usa la duración fija...
    await runtimesIdle();
    expect(savedSeasons(bb.id).map((s) => s.minutes)).toEqual([42, 44, 46, 48, 50]); // ...y las medias aparecen después
    expect(seasonCalls().length).toBe(before); // (la caché de 30 días evita volver a pedir a TMDB)
  });
});
