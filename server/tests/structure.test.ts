import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { all, get, run } from '../src/db';
import { diffStructure, reconcileProgress, seenBySeason } from '../src/domain/structure';
import { newsText } from '../src/domain/news';
import { newsIdle } from '../src/news';
import { Client, startTestApp } from './client';

const S = (...eps: number[]) => eps.map((episodes, i) => ({ number: i + 1, episodes }));
const R = (...x: [number, string | null, number][]) => x.map(([n, air, eps]) => ({ n, air, eps }));
const TODAY = '2026-10-16';

describe('estructura de temporadas: reglas puras', () => {
  const cur = S(7, 13, 13);

  it('sin cambios, sin estructura previa o con datos vacíos de TMDB no hay nada que hacer', () => {
    expect(diffStructure(cur, R([1, '2008-01-01', 7], [2, '2009-01-01', 13], [3, '2010-01-01', 13]), TODAY)).toBeNull();
    expect(diffStructure(null, R([1, '2008-01-01', 7]), TODAY)).toBeNull();
    expect(diffStructure(cur, [], TODAY)).toBeNull();
  });

  it('una temporada nueva solo se añade cuando ya se ha estrenado y tiene episodios', () => {
    const base = R([1, '2008-01-01', 7], [2, '2009-01-01', 13], [3, '2010-01-01', 13]);
    expect(diffStructure(cur, [...base, ...R([4, '2027-01-01', 8])], TODAY)).toBeNull(); // anunciada: solo aviso
    expect(diffStructure(cur, [...base, ...R([4, null, 0])], TODAY)).toBeNull();
    const c = diffStructure(cur, [...base, ...R([4, '2026-10-16', 8])], TODAY)!;
    expect(c).toMatchObject({ added: [4], removed: [], total: 41 });
    expect(c.next).toEqual(S(7, 13, 13, 8));
  });

  it('una temporada que TMDB ya no publica se elimina; si se quedara sin ninguna, se ignora', () => {
    const c = diffStructure(cur, R([1, '2008-01-01', 7], [3, '2010-01-01', 13]), TODAY)!;
    expect(c).toMatchObject({ added: [], removed: [2], total: 20 });
    expect(c.next.map((s) => s.number)).toEqual([1, 3]);
    expect(diffStructure(cur, R([9, '2020-01-01', 5]), TODAY)).toMatchObject({ added: [9], removed: [1, 2, 3] });
    expect(diffStructure(cur, R([1, null, 0]), TODAY)).toBeNull();
  });

  it('conserva las duraciones ya calculadas de las temporadas que siguen', () => {
    const withMin = [{ number: 1, episodes: 7, minutes: 47 }, { number: 2, episodes: 13, minutes: 48 }];
    const c = diffStructure(withMin, R([1, '2008-01-01', 7], [2, '2009-01-01', 13], [3, '2010-01-01', 5]), TODAY)!;
    expect(c.next).toEqual([...withMin, { number: 3, episodes: 5 }]);
  });

  it('episodios vistos por temporada', () => {
    expect([...seenBySeason(cur, 10)]).toEqual([[1, 7], [2, 3], [3, 0]]);
    expect([...seenBySeason(cur, 99)]).toEqual([[1, 7], [2, 13], [3, 13]]);
  });

  it('temporada añadida: Finalizado pasa a «Por ver» con su progreso; el resto no cambia', () => {
    const c = diffStructure(cur, R([1, 'a', 7], [2, 'a', 13], [3, 'a', 13], [4, '2020-01-01', 8]), TODAY)!;
    expect(reconcileProgress({ status: 'FINALIZADO', watched: 33 }, cur, c)).toEqual({ status: 'POR_VER', watched: 33 });
    expect(reconcileProgress({ status: 'VIENDO', watched: 10 }, cur, c)).toEqual({ status: 'VIENDO', watched: 10 });
    expect(reconcileProgress({ status: 'POR_VER', watched: 0 }, cur, c)).toEqual({ status: 'POR_VER', watched: 0 });
    expect(reconcileProgress({ status: 'DEJADO', watched: 20 }, cur, c)).toEqual({ status: 'DEJADO', watched: 20 });
  });

  it('temporada eliminada: se restan solo sus episodios y, si ya no falta nada, pasa a Finalizado', () => {
    const quitar3 = diffStructure(cur, R([1, 'a', 7], [2, 'a', 13]), TODAY)!;
    expect(reconcileProgress({ status: 'VIENDO', watched: 25 }, cur, quitar3)).toEqual({ status: 'FINALIZADO', watched: 20 });
    expect(reconcileProgress({ status: 'FINALIZADO', watched: 33 }, cur, quitar3)).toEqual({ status: 'FINALIZADO', watched: 20 });
    expect(reconcileProgress({ status: 'VIENDO', watched: 12 }, cur, quitar3)).toEqual({ status: 'VIENDO', watched: 12 });
    expect(reconcileProgress({ status: 'POR_VER', watched: 0 }, cur, quitar3)).toEqual({ status: 'POR_VER', watched: 0 });
    expect(reconcileProgress({ status: 'DEJADO', watched: 25 }, cur, quitar3)).toEqual({ status: 'DEJADO', watched: 20 });
    // quitar la temporada de en medio: los episodios de la 3 pasan a ser los de la «nueva» 2 sin perderse
    const quitar2 = diffStructure(cur, R([1, 'a', 7], [3, 'a', 13]), TODAY)!;
    expect(reconcileProgress({ status: 'VIENDO', watched: 20 }, cur, quitar2)).toEqual({ status: 'VIENDO', watched: 7 });
  });

  it('textos de los avisos nuevos', () => {
    expect(newsText({ kind: 'season_removed', season: 6 }, TODAY)).toBe('Temporada 6 eliminada');
    expect(newsText({ kind: 'movie_removed' }, TODAY)).toMatch(/^Película eliminada/);
  });
});

describe('estructura de temporadas: lista, perfil y listas conjuntas', () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  const ana = new Client();
  const beto = new Client();
  let anaId = 0;
  let betoId = 0;
  let bb: any;
  let peli: any;
  let listId = 0;
  const mock = () => app.mock.state;

  const content = () => get<{ total_episodes: number; seasons: string }>('SELECT total_episodes, seasons FROM content WHERE id = ?', [bb.id])!;
  const mine = () => get<{ status: string; watched_episodes: number; is_favorite: number }>('SELECT status, watched_episodes, is_favorite FROM user_content WHERE user_id = ? AND content_id = ?', [anaId, bb.id])!;
  const joint = (id = bb.id) => get<{ status: string; watched_episodes: number }>('SELECT status, watched_episodes FROM joint_list_items WHERE list_id = ? AND content_id = ?', [listId, id]);

  /** Beto solo tiene la serie en la lista conjunta: su refresco también debe mantenerla al día. */
  async function refresh(c = beto, id = betoId) {
    await c.get('/api/notifications');
    await newsIdle(id);
    return (await c.get('/api/notifications')).body;
  }

  beforeAll(async () => {
    app = await startTestApp();
    Object.assign(config, { newsUserIntervalMs: 0, newsTtlActiveMs: 0, newsTtlIdleMs: 0, newsRelatedTtlMs: 0, newsRoundDelayMs: 0 });
    anaId = (await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' })).body.user.id;
    betoId = (await beto.post('/api/auth/register', { username: 'beto', email: 'beto@test.com', password: 'secreto123' })).body.user.id;
    await ana.post('/api/friends/requests', { username: 'beto' });
    await beto.post(`/api/friends/requests/${(await beto.get('/api/friends')).body.incoming[0].id}/accept`);
    const res = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
    bb = res.find((x: any) => x.title === 'Breaking Bad');
    peli = res.find((x: any) => x.externalId === 'movie-101');
    await ana.put(`/api/library/${bb.id}/status`, { status: 'FINALIZADO' }); // 62 episodios
    await ana.put(`/api/library/${bb.id}/favorite`, { value: true });
    await ana.put(`/api/library/${peli.id}/status`, { status: 'FINALIZADO' });
    listId = (await ana.post('/api/lists', { friendId: betoId })).body.id;
    await ana.post(`/api/lists/${listId}/items`, { contentId: bb.id });
    await ana.post(`/api/lists/${listId}/items`, { contentId: peli.id });
    await ana.put(`/api/lists/${listId}/items/${bb.id}`, { status: 'FINALIZADO' });
    await ana.put(`/api/lists/${listId}/items/${peli.id}`, { status: 'FINALIZADO' });
  });
  afterAll(() => app.stop());

  it('antes de nada: todo visto y sin cambios', () => {
    expect(content().total_episodes).toBe(62);
    expect(mine()).toMatchObject({ status: 'FINALIZADO', watched_episodes: 62 });
    expect(joint()).toEqual({ status: 'FINALIZADO', watched_episodes: 62 });
  });

  it('una temporada nueva ya estrenada actualiza el contenido y pasa a «Por ver» en la lista y en la lista conjunta', async () => {
    mock().extraSeasons[1396] = [{ season_number: 6, episode_count: 8, air_date: '2024-05-05' }];
    await refresh();
    expect(content().total_episodes).toBe(70);
    expect(JSON.parse(content().seasons).map((s: any) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(mine()).toMatchObject({ status: 'POR_VER', watched_episodes: 62, is_favorite: 1 });
    expect(joint()).toEqual({ status: 'POR_VER', watched_episodes: 62 });
    // la ficha, el perfil y las comparaciones leen la misma estructura
    const ficha = (await ana.get(`/api/content/${bb.id}`)).body;
    expect(ficha.content.totalEpisodes).toBe(70);
    expect(ficha.content.seasons).toHaveLength(6);
    const perfil = (await ana.get('/api/me/profile')).body;
    expect(perfil.stats.seasonsWatched).toBe(5); // la 6 aún no está vista
  });

  it('no vuelve a tocar nada si TMDB no cambia, y respeta lo que la persona cambie a mano', async () => {
    await ana.put(`/api/library/${bb.id}/status`, { status: 'VIENDO' });
    await refresh();
    expect(mine()).toMatchObject({ status: 'VIENDO', watched_episodes: 62 });
    await ana.put(`/api/library/${bb.id}/episodes`, { watched: 70 });
    expect(mine()).toMatchObject({ status: 'FINALIZADO', watched_episodes: 70 });
  });

  it('una temporada eliminada resta sus episodios y, si ya está todo visto, queda «Finalizado»; avisa', async () => {
    await ana.put(`/api/library/${bb.id}/episodes`, { watched: 65 });
    expect(mine().status).toBe('VIENDO');
    mock().extraSeasons[1396] = []; // TMDB ya no tiene la temporada 6
    await ana.get('/api/notifications');
    await newsIdle(anaId);
    expect(content().total_episodes).toBe(62);
    expect(mine()).toMatchObject({ status: 'FINALIZADO', watched_episodes: 62 });
    expect(joint()).toEqual({ status: 'FINALIZADO', watched_episodes: 62 }); // la lista conjunta estaba POR_VER con 62
    const avisos = (await ana.get('/api/notifications')).body.items;
    expect(avisos.map((i: any) => i.text)).toContain('Temporada 6 eliminada');
    expect((await ana.get('/api/me/profile')).body.stats.seasonsWatched).toBe(5);
  });

  it('una película que TMDB elimina sale de la lista, del perfil y de las listas conjuntas, con aviso', async () => {
    expect((await ana.get('/api/me/profile')).body.stats.episodes).toBe(63);
    mock().removedMovies.push(101);
    await refresh(ana, anaId);
    expect(get('SELECT 1 FROM user_content WHERE user_id = ? AND content_id = ?', [anaId, peli.id])).toBeUndefined();
    expect(joint(peli.id)).toBeUndefined();
    expect((await ana.get('/api/me/profile')).body.stats.episodes).toBe(62);
    const avisos = (await ana.get('/api/notifications')).body.items;
    expect(avisos.find((i: any) => i.kind === 'movie_removed')).toMatchObject({ title: 'Pelicula 1', seen: false });
    // el contenido sigue existiendo y no se repite el aviso al volver a calcular
    expect(all('SELECT 1 FROM content WHERE id = ?', [peli.id])).toHaveLength(1);
    const otra = await refresh(ana, anaId);
    expect(otra.items.filter((i: any) => i.kind === 'movie_removed')).toHaveLength(1);
  });

  describe('casos límite', () => {
    const carla = new Client();
    const dani = new Client();
    let carlaId = 0;
    let daniId = 0;
    let list2 = 0;
    const item2 = () => get<{ status: string; watched_episodes: number }>('SELECT status, watched_episodes FROM joint_list_items WHERE list_id = ? AND content_id = ?', [list2, bb.id])!;
    const removedNotes = (uid: number) => all('SELECT 1 FROM notifications WHERE user_id = ? AND content_id = ? AND kind = ?', [uid, bb.id, 'season_removed']).length;

    it('contenido solo en una lista conjunta: lo refresca la otra persona, se mantiene al día y no genera avisos a quien no lo tiene', async () => {
      carlaId = (await carla.post('/api/auth/register', { username: 'carla', email: 'carla@test.com', password: 'secreto123' })).body.user.id;
      daniId = (await dani.post('/api/auth/register', { username: 'dani', email: 'dani@test.com', password: 'secreto123' })).body.user.id;
      await carla.post('/api/friends/requests', { username: 'dani' });
      await dani.post(`/api/friends/requests/${(await dani.get('/api/friends')).body.incoming[0].id}/accept`);
      list2 = (await carla.post('/api/lists', { friendId: daniId })).body.id;
      await dani.post(`/api/lists/${list2}/items`, { contentId: bb.id });
      await dani.put(`/api/lists/${list2}/items/${bb.id}`, { status: 'FINALIZADO' });
      expect(get('SELECT 1 FROM user_content WHERE user_id IN (?, ?) AND content_id = ?', [carlaId, daniId, bb.id])).toBeUndefined();
      expect(item2()).toEqual({ status: 'FINALIZADO', watched_episodes: 62 });

      await ana.put(`/api/library/${bb.id}/status`, { status: 'DEJADO' });
      mock().extraSeasons[1396] = [{ season_number: 6, episode_count: 8, air_date: '2024-05-05' }];
      const res = await refresh(carla, carlaId);
      expect(content().total_episodes).toBe(70);
      expect(item2()).toEqual({ status: 'POR_VER', watched_episodes: 62 });
      expect(res.items).toEqual([]); // quien solo la tiene en una lista conjunta no recibe avisos
      expect(mine()).toMatchObject({ status: 'DEJADO', watched_episodes: 62 }); // «Dejado» se respeta
    });

    it('al eliminar la temporada la refresca la otra persona; «Dejado» se respeta y el aviso no se duplica', async () => {
      expect(removedNotes(anaId)).toBe(1); // del test anterior de eliminación
      mock().extraSeasons[1396] = [];
      await refresh(dani, daniId);
      expect(content().total_episodes).toBe(62);
      expect(item2()).toEqual({ status: 'FINALIZADO', watched_episodes: 62 });
      expect(mine()).toMatchObject({ status: 'DEJADO', watched_episodes: 62 });
      expect(removedNotes(anaId)).toBe(1);
      expect(removedNotes(carlaId) + removedNotes(daniId)).toBe(0);
      const avisos = (await ana.get('/api/notifications')).body.items.filter((i: any) => i.text === 'Temporada 6 eliminada');
      expect(avisos).toHaveLength(1);
    });

    it('película solo en una lista conjunta que TMDB elimina: se borra de la lista sin avisos', async () => {
      const res = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
      const p3 = res.find((x: any) => x.externalId === 'movie-103');
      await dani.post(`/api/lists/${list2}/items`, { contentId: p3.id });
      expect(get('SELECT 1 FROM joint_list_items WHERE list_id = ? AND content_id = ?', [list2, p3.id])).toBeDefined();
      mock().removedMovies.push(103);
      const out = await refresh(carla, carlaId);
      expect(get('SELECT 1 FROM joint_list_items WHERE content_id = ?', [p3.id])).toBeUndefined();
      expect(out.items.filter((i: any) => i.kind === 'movie_removed')).toHaveLength(0);
      expect(all('SELECT 1 FROM notifications WHERE content_id = ?', [p3.id])).toHaveLength(0);
    });

    it('un 404 de la colección (saga) no borra la película', async () => {
      const res = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
      const p2 = res.find((x: any) => x.externalId === 'movie-102');
      await ana.put(`/api/library/${p2.id}/status`, { status: 'FINALIZADO' });
      mock().collections[102] = { id: 900, parts: [] };
      mock().removedCollections.push(900);
      const out = await refresh(ana, anaId);
      expect(get('SELECT 1 FROM user_content WHERE user_id = ? AND content_id = ?', [anaId, p2.id])).toBeDefined();
      expect(out.items.filter((i: any) => i.kind === 'movie_removed' && i.title === 'Pelicula 2')).toHaveLength(0);
    });

    it('si la serie no tiene estructura guardada (seasons null) no se toca nada', async () => {
      await ana.put(`/api/library/${bb.id}/status`, { status: 'FINALIZADO' });
      run('UPDATE content SET seasons = NULL WHERE id = ?', [bb.id]);
      mock().extraSeasons[1396] = [{ season_number: 6, episode_count: 8, air_date: '2024-05-05' }];
      await refresh(ana, anaId);
      expect(content()).toEqual({ total_episodes: 62, seasons: null });
      expect(mine()).toMatchObject({ status: 'FINALIZADO', watched_episodes: 62 });
      expect(item2()).toEqual({ status: 'FINALIZADO', watched_episodes: 62 });
    });
  });
});
