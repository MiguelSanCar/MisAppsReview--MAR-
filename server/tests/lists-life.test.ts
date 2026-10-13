import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { get, run } from '../src/db';
import { inactivityInfo, purgeInactiveLists } from '../src/listLife';
import { Client, startTestApp } from './client';

let app: Awaited<ReturnType<typeof startTestApp>>;
const ana = new Client();
const beto = new Client();
const carla = new Client();
const dani = new Client();
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

let anaId: number, betoId: number, carlaId: number, danaId: number;
let listId: number;
let movieId: number;

const setActivity = (id: number, iso: string) => run('UPDATE joint_lists SET last_activity_at = ? WHERE id = ?', [iso, id]);
const lastActivity = (id: number) => get<{ a: string }>('SELECT last_activity_at AS a FROM joint_lists WHERE id = ?', [id])!.a;

beforeAll(async () => {
  app = await startTestApp();
  for (const [c, n] of [[ana, 'ana'], [beto, 'beto'], [carla, 'carla'], [dani, 'dani']] as const) {
    expect((await c.post('/api/auth/register', { username: n, email: n + '@test.com', password: 'secreto123' })).status).toBe(201);
  }
  anaId = (await ana.get('/api/auth/me')).body.user.id;
  betoId = (await beto.get('/api/auth/me')).body.user.id;
  carlaId = (await carla.get('/api/auth/me')).body.user.id;
  danaId = (await dani.get('/api/auth/me')).body.user.id;
  // ana es amiga de beto y de carla; dani no es amigo de nadie
  for (const other of ['beto', 'carla']) {
    await ana.post('/api/friends/requests', { username: other });
    const c = other === 'beto' ? beto : carla;
    const inc = (await c.get('/api/friends')).body.incoming[0];
    await c.post(`/api/friends/requests/${inc.id}/accept`);
  }
  const res = (await ana.get('/api/search?q=prueba&type=pelicula')).body.results;
  movieId = res[0].id;
});
afterAll(() => app.stop());

describe('«Vuestra lista»: la lista de la pareja', () => {
  it('sin lista todavía: la pareja devuelve null; solo con amigos', async () => {
    const r = await ana.get('/api/lists/with/beto');
    expect(r.status).toBe(200);
    expect(r.body.list).toBeNull();
    expect(r.body.friend.username).toBe('beto');
    expect((await ana.get('/api/lists/with/dani')).status).toBe(403); // no son amigos
    expect((await ana.get('/api/lists/with/ana')).status).toBe(400); // uno mismo
    expect((await ana.get('/api/lists/with/nadie')).status).toBe(404);
    expect((await new Client().get('/api/lists/with/beto')).status).toBe(401);
  });

  it('se crea directamente (nombre por defecto) sin permiso de la otra persona', async () => {
    const r = await ana.post('/api/lists', { friendId: betoId });
    expect(r.status).toBe(201);
    listId = r.body.id;
    // beto la ve al instante, sin haber hecho nada
    const mine = (await beto.get('/api/lists')).body;
    expect(mine.lists.map((l: any) => l.name)).toEqual(['Lista de ana y beto']);
    const w = (await beto.get('/api/lists/with/ana')).body;
    expect(w.list).toMatchObject({ id: listId, myStatus: 'active' });
    expect(w.list.members.map((m: any) => m.username).sort()).toEqual(['ana', 'beto']);
  });

  it('por ahora solo una lista por pareja (la crea quien sea): 409', async () => {
    expect((await ana.post('/api/lists', { friendId: betoId })).status).toBe(409);
    const r = await beto.post('/api/lists', { friendId: anaId, name: 'Otra' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Ya tenéis una lista/);
    // pero con otra persona sí
    expect((await carla.post('/api/lists', { friendId: anaId, name: 'Con carla' })).status).toBe(201);
    expect((await ana.get('/api/lists')).body.lists.length).toBe(2);
  });

  it('el límite por pareja es configurable (el modelo admite varias)', async () => {
    const prev = config.maxListsPerPair;
    config.maxListsPerPair = 2;
    try {
      expect((await ana.post('/api/lists', { friendId: carlaId, name: 'Segunda con carla' })).status).toBe(201);
    } finally {
      config.maxListsPerPair = prev;
    }
  });

  it('solo con amigos y nombre válido', async () => {
    expect((await ana.post('/api/lists', { friendId: danaId })).status).toBe(400);
    expect((await ana.post('/api/lists', { friendId: carlaId, name: 'x'.repeat(50) })).status).toBe(400);
  });
});

describe('salir de una lista sin borrarla', () => {
  it('quien sale pierde el acceso, pero la lista se conserva para la otra persona', async () => {
    await ana.post(`/api/lists/${listId}/items`, { contentId: movieId });
    expect((await beto.post(`/api/lists/${listId}/leave`)).status).toBe(200);

    const mine = (await beto.get('/api/lists')).body;
    expect(mine.lists.map((l: any) => l.id)).not.toContain(listId);
    expect(mine.left.map((l: any) => l.id)).toEqual([listId]);
    expect((await beto.get(`/api/lists/${listId}`)).status).toBe(404);
    expect((await beto.post(`/api/lists/${listId}/items`, { contentId: movieId })).status).toBe(404);
    expect((await beto.post(`/api/lists/${listId}/leave`)).status).toBe(404); // ya no está

    // la lista sigue existiendo y ana la ve (con beto marcado como que salió)
    const a = (await ana.get(`/api/lists/${listId}`)).body;
    expect(a.items.length).toBe(1);
    expect(a.list.members.find((m: any) => m.username === 'beto').left).toBe(true);
    expect(get<{ n: number }>('SELECT COUNT(*) AS n FROM joint_lists WHERE id = ?', [listId])!.n).toBe(1);
  });

  it('«Vuestra lista» sigue encontrándola para quien salió', async () => {
    const w = (await beto.get('/api/lists/with/ana')).body;
    expect(w.list).toMatchObject({ id: listId, myStatus: 'left' });
    // y no se puede crear otra mientras exista esa
    expect((await beto.post('/api/lists', { friendId: anaId })).status).toBe(409);
  });

  it('se puede volver a unir y recupera el acceso a todo', async () => {
    expect((await beto.post(`/api/lists/${listId}/join`)).status).toBe(200);
    expect((await beto.get(`/api/lists/${listId}`)).body.items.length).toBe(1);
    expect((await beto.get('/api/lists')).body.left).toEqual([]);
    expect((await beto.post(`/api/lists/${listId}/join`)).status).toBe(200); // ya dentro: sin error
  });

  it('para volver hace falta seguir siendo amigos', async () => {
    await beto.post(`/api/lists/${listId}/leave`);
    await ana.del(`/api/friends/${betoId}`);
    expect((await beto.post(`/api/lists/${listId}/join`)).status).toBe(403);
    // se hacen amigos otra vez
    await ana.post('/api/friends/requests', { username: 'beto' });
    const inc = (await beto.get('/api/friends')).body.incoming[0];
    await beto.post(`/api/friends/requests/${inc.id}/accept`);
    expect((await beto.post(`/api/lists/${listId}/join`)).status).toBe(200);
  });

  it('quien nunca estuvo en la lista no puede unirse', async () => {
    expect((await dani.post(`/api/lists/${listId}/join`)).status).toBe(404);
    expect((await dani.get(`/api/lists/${listId}`)).status).toBe(404);
  });

  it('si salen las dos personas la lista sigue existiendo y cualquiera puede volver', async () => {
    await ana.post(`/api/lists/${listId}/leave`);
    await beto.post(`/api/lists/${listId}/leave`);
    expect(get<{ n: number }>('SELECT COUNT(*) AS n FROM joint_lists WHERE id = ?', [listId])!.n).toBe(1);
    expect((await ana.get('/api/lists')).body.left.map((l: any) => l.id)).toContain(listId);
    expect((await ana.post(`/api/lists/${listId}/join`)).status).toBe(200);
    expect((await beto.post(`/api/lists/${listId}/join`)).status).toBe(200);
  });
});

describe('inactividad: aviso a los 45 días y borrado a los 2 meses', () => {
  it('cualquier actividad actualiza la última actividad', async () => {
    setActivity(listId, daysAgo(40));
    await ana.put(`/api/lists/${listId}/items/${movieId}`, { status: 'VIENDO' });
    expect(Date.now() - Date.parse(lastActivity(listId))).toBeLessThan(5000);

    for (const act of [
      () => beto.put(`/api/lists/${listId}/items/${movieId}`, { watched: 1 }),
      () => ana.post(`/api/lists/${listId}/items/${movieId}/rollback`, { historyId: (get<{ id: number }>('SELECT MIN(id) AS id FROM joint_list_history WHERE list_id = ?', [listId])!.id) }),
      () => beto.post(`/api/lists/${listId}/leave`),
      () => beto.post(`/api/lists/${listId}/join`),
    ]) {
      setActivity(listId, daysAgo(40));
      expect((await act()).status).toBeLessThan(300);
      expect(Date.now() - Date.parse(lastActivity(listId)), 'debe actualizarse').toBeLessThan(5000);
    }
  });

  it('ver la lista no cuenta como actividad', async () => {
    setActivity(listId, daysAgo(40));
    await ana.get(`/api/lists/${listId}`);
    await ana.get('/api/lists');
    await beto.get(`/api/lists/${listId}/items/${movieId}/history`);
    expect(Math.round((Date.now() - Date.parse(lastActivity(listId))) / DAY)).toBe(40);
  });

  it('inactivityInfo: aviso en los últimos 15 días antes del borrado (60)', () => {
    const now = Date.now();
    const at = (d: number) => inactivityInfo(new Date(now - d * DAY).toISOString(), now);
    expect(at(0)).toMatchObject({ warning: false, daysLeft: 60 });
    expect(at(44)).toMatchObject({ warning: false, daysLeft: 16 });
    expect(at(45)).toMatchObject({ warning: true, daysLeft: 15 });
    expect(at(59)).toMatchObject({ warning: true, daysLeft: 1 });
    expect(at(70)).toMatchObject({ warning: true, daysLeft: 0 });
    expect(Date.parse(at(10).deleteAt)).toBe(now - 10 * DAY + 60 * DAY);
  });

  it('la API informa del aviso y de la fecha de borrado', async () => {
    setActivity(listId, daysAgo(10));
    let l = (await ana.get(`/api/lists/${listId}`)).body.list;
    expect(l.inactivity.warning).toBe(false);
    setActivity(listId, daysAgo(50));
    l = (await ana.get(`/api/lists/${listId}`)).body.list;
    expect(l.inactivity).toMatchObject({ warning: true, daysLeft: 10 });
    expect((await ana.get('/api/lists')).body.lists.find((x: any) => x.id === listId).inactivity.warning).toBe(true);
  });

  it('el borrado automático elimina solo lo que supera los 2 meses y arrastra su contenido', async () => {
    const other = (await carla.get('/api/lists')).body.lists[0].id; // otra lista (con carla), reciente
    setActivity(listId, daysAgo(59));
    expect(purgeInactiveLists()).toEqual([]);
    expect(get('SELECT 1 FROM joint_lists WHERE id = ?', [listId])).toBeTruthy();

    setActivity(listId, daysAgo(61));
    expect(purgeInactiveLists()).toEqual([listId]);
    expect(get('SELECT 1 FROM joint_lists WHERE id = ?', [listId])).toBeUndefined();
    for (const t of ['joint_list_items', 'joint_list_members', 'joint_list_history']) {
      expect(get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE list_id = ?`, [listId])!.n, t).toBe(0);
    }
    expect(get('SELECT 1 FROM joint_lists WHERE id = ?', [other])).toBeTruthy(); // la otra sigue
    expect((await ana.get(`/api/lists/${listId}`)).status).toBe(404);
    // tras el borrado la pareja puede crear una lista nueva
    expect((await ana.post('/api/lists', { friendId: betoId })).status).toBe(201);
  });

  it('los plazos son configurables', () => {
    const [d, w] = [config.jointInactivityDays, config.jointWarningDays];
    config.jointInactivityDays = 10;
    config.jointWarningDays = 3;
    try {
      const now = Date.now();
      expect(inactivityInfo(new Date(now - 7 * DAY).toISOString(), now)).toMatchObject({ warning: true, daysLeft: 3 });
      expect(inactivityInfo(new Date(now - 6 * DAY).toISOString(), now).warning).toBe(false);
    } finally {
      config.jointInactivityDays = d;
      config.jointWarningDays = w;
    }
  });
});
