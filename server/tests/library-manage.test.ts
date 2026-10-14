import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { get } from '../src/db';
import { Client, startTestApp } from './client';

let app: Awaited<ReturnType<typeof startTestApp>>;
const ana = new Client();
const beto = new Client();

let tv: any;      // Breaking Bad: 62 episodios de 50 min
let movies: any[]; // películas de 1 episodio (90 min)

const profile = async (c = ana) => (await c.get('/api/me/profile')).body.stats;
const put = (c: Client, p: string, b: object) => c.put(p, b);

beforeAll(async () => {
  app = await startTestApp();
  await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' });
  await beto.post('/api/auth/register', { username: 'beto', email: 'beto@test.com', password: 'secreto123' });
  const res = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
  tv = res.find((x: any) => x.title === 'Breaking Bad');
  movies = res.filter((x: any) => x.type === 'pelicula');
});
afterAll(() => app.stop());

describe('revisionado: volver a ver algo finalizado', () => {
  it('una serie finalizada suma todos sus episodios y minutos', async () => {
    const r = await put(ana, `/api/library/${tv.id}/favorite`, { value: true });
    expect(r.body.state).toMatchObject({ status: 'FINALIZADO', watched: 62, rewatch: 0, previousEpisodes: 0 });
    const s = await profile();
    expect(s.episodes).toBe(62);
    expect(s.totalMinutes).toBe(62 * 50);
  });

  it('solo se puede volver a ver lo que está finalizado', async () => {
    const m = movies[0];
    expect((await ana.post(`/api/library/${m.id}/rewatch`)).status).toBe(400); // ni siquiera está en la lista
    await put(ana, `/api/library/${m.id}/later`, { value: true });
    expect((await ana.post(`/api/library/${m.id}/rewatch`)).body.error).toMatch(/finalizado/); // Por ver
    await put(ana, `/api/library/${m.id}/status`, { status: 'VIENDO' });
    expect((await ana.post(`/api/library/${m.id}/rewatch`)).status).toBe(400);
    await ana.del(`/api/library/${m.id}`);
    expect((await new Client().post(`/api/library/${tv.id}/rewatch`)).status).toBe(401);
  });

  it('pasa a «Por ver» con los episodios a 0, marca el revisionado y NO toca las estadísticas', async () => {
    const r = await ana.post(`/api/library/${tv.id}/rewatch`);
    expect(r.status).toBe(200);
    expect(r.body.state).toMatchObject({ status: 'POR_VER', watched: 0, rewatch: 1, previousEpisodes: 62, favorite: true });
    const s = await profile();
    expect(s.episodes).toBe(62);               // se conservan los episodios
    expect(s.totalMinutes).toBe(62 * 50);      // y los minutos
    expect(s.byStatus.POR_VER).toBe(1);
    expect(s.finishedByType.serie).toBe(1);    // sigue contando como terminada
    expect(s.rewatches).toMatchObject({ contents: 1, times: 1, episodes: 0, totalMinutes: 0 }); // aún no se ha visto nada de la revisión
    // la ficha ve el estado para mostrar «Reviendo»
    const c = await ana.get(`/api/content/${tv.id}`);
    expect(c.body.state).toMatchObject({ status: 'POR_VER', watched: 0, rewatch: 1 });
    // y en la lista
    const items = (await ana.get('/api/library?status=POR_VER')).body.items;
    expect(items.map((i: any) => i.id)).toContain(tv.id);
  });

  it('quitar de «ver más adelante» durante el revisionado no borra lo que ya se vio', async () => {
    await put(ana, `/api/library/${tv.id}/later`, { value: false });
    expect(get('SELECT 1 FROM user_content WHERE content_id = ?', [tv.id])).toBeTruthy();
    expect((await profile()).episodes).toBe(62);
  });

  it('al ir viendo episodios se suman a los anteriores', async () => {
    const r = await put(ana, `/api/library/${tv.id}/episodes`, { watched: 10 });
    expect(r.body.state).toMatchObject({ status: 'VIENDO', watched: 10, rewatch: 1, previousEpisodes: 62 });
    expect((await profile()).episodes).toBe(72);
    expect((await profile()).rewatches).toMatchObject({ episodes: 10, totalMinutes: 500 });
    expect((await profile()).totalMinutes).toBe(72 * 50);
  });

  it('quitar episodios a mano resta de las estadísticas (solo los del visionado actual)', async () => {
    await put(ana, `/api/library/${tv.id}/episodes`, { watched: 4 });
    expect((await profile()).episodes).toBe(66);
    await put(ana, `/api/library/${tv.id}/episodes`, { watched: 0 });
    expect((await profile()).episodes).toBe(62);   // los 62 anteriores no se pierden
    expect((await profile()).totalMinutes).toBe(62 * 50);
  });

  it('al finalizar de nuevo, el contenido cuenta dos veces', async () => {
    const r = await put(ana, `/api/library/${tv.id}/episodes`, { watched: 9999 });
    expect(r.body.state).toMatchObject({ status: 'FINALIZADO', watched: 62, rewatch: 1, previousEpisodes: 62 });
    expect((await profile()).episodes).toBe(124);
    expect((await profile()).rewatches).toMatchObject({ contents: 1, times: 1, episodes: 62, totalMinutes: 62 * 50 });
    // y se puede volver a ver otra vez: las dos pasadas anteriores se conservan
    const again = await ana.post(`/api/library/${tv.id}/rewatch`);
    expect(again.body.state).toMatchObject({ rewatch: 2, previousEpisodes: 124, watched: 0 });
    expect((await profile()).episodes).toBe(124);
    expect((await profile()).rewatches).toMatchObject({ times: 2, episodes: 62 }); // el 1.º no cuenta; el 2.º (62) sí; el 3.º acaba de empezar
  });

  it('un perfil ajeno ve lo mismo que el propio (las estadísticas son públicas con el perfil)', async () => {
    await ana.put('/api/me/visibility', { isPublic: true, showList: false });
    const pub = (await new Client().get('/api/profiles/ana')).body;
    expect(pub.stats.episodes).toBe(124);
  });
});

describe('borrar contenidos de la lista', () => {
  it('borrar uno resta sus episodios y minutos del perfil', async () => {
    const m = movies[1];
    await put(ana, `/api/library/${m.id}/status`, { status: 'FINALIZADO' });
    expect((await profile()).episodes).toBe(125);
    expect((await profile()).totalMinutes).toBe(124 * 50 + 90);
    expect((await ana.del(`/api/library/${m.id}`)).status).toBe(200);
    expect((await profile()).episodes).toBe(124);
    expect((await profile()).totalMinutes).toBe(124 * 50);
    expect((await ana.get('/api/library')).body.items.map((i: any) => i.id)).not.toContain(m.id);
  });

  it('borrar un contenido con revisionado se lleva también los visionados anteriores', async () => {
    expect((await ana.post('/api/library/delete', { ids: [tv.id] })).body.deleted).toBe(1);
    const s = await profile();
    expect(s.episodes).toBe(0);
    expect(s.totalMinutes).toBe(0);
    expect(s.favorites).toBeUndefined();
    expect((await ana.get('/api/me/profile')).body.favorites.length).toBe(0); // y sale de favoritos
  });

  it('borrado en bloque: varios a la vez, solo los propios y los que existen', async () => {
    const [a, b, c] = movies;
    for (const m of [a, b, c]) await put(ana, `/api/library/${m.id}/status`, { status: 'FINALIZADO' });
    await put(beto, `/api/library/${a.id}/status`, { status: 'FINALIZADO' }); // beto también tiene «a»
    expect((await profile()).episodes).toBe(3);

    const r = await ana.post('/api/library/delete', { ids: [a.id, b.id, a.id, 99999] }); // repetido e inexistente
    expect(r.body.deleted).toBe(2);
    expect((await profile()).episodes).toBe(1);
    expect((await ana.get('/api/library')).body.items.map((i: any) => i.id)).toEqual([c.id]);
    // lo de beto no se toca
    expect((await beto.get('/api/library')).body.items.map((i: any) => i.id)).toEqual([a.id]);
    expect((await profile(beto)).episodes).toBe(1);
  });

  it('valida la petición de borrado en bloque', async () => {
    expect((await ana.post('/api/library/delete', { ids: [] })).status).toBe(400);
    expect((await ana.post('/api/library/delete', { ids: ['x'] })).status).toBe(400);
    expect((await ana.post('/api/library/delete', {})).status).toBe(400);
    expect((await ana.post('/api/library/delete', { ids: Array.from({ length: 501 }, (_, i) => i + 1) })).status).toBe(400);
    expect((await new Client().post('/api/library/delete', { ids: [1] })).status).toBe(401);
  });

  it('lo borrado se puede volver a añadir desde cero', async () => {
    const r = await put(ana, `/api/library/${tv.id}/favorite`, { value: true });
    expect(r.body.state).toMatchObject({ status: 'FINALIZADO', watched: 62, rewatch: 0, previousEpisodes: 0 });
    expect((await profile()).episodes).toBe(63);
  });
});
