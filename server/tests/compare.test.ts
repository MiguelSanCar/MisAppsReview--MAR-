import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compareProfiles, summarize } from '../src/compare';
import { Client, startTestApp } from './client';

let app: Awaited<ReturnType<typeof startTestApp>>;
const ana = new Client();
const beto = new Client();
const carla = new Client();
const dani = new Client();
let items: any[];

beforeAll(async () => {
  app = await startTestApp();
  for (const [c, n] of [[ana, 'ana'], [beto, 'beto'], [carla, 'carla'], [dani, 'dani']] as const) {
    await c.post('/api/auth/register', { username: n, email: `${n}@test.com`, password: 'secreto123' });
  }
  items = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
});
afterAll(() => app.stop());

const befriend = async (a: Client, b: Client) => {
  const t = (await a.post('/api/invites/mine')).body.token;
  await b.post(`/api/invites/${t}/accept`);
};

describe('comparación pura', () => {
  const profile = (minutes: number, byStatus: any, fin: any, favs = 0): any => ({
    user: { username: 'x' },
    stats: { totalMinutes: minutes, watchTime: { text: `${minutes} min` }, episodes: minutes / 50, byStatus, finishedByType: fin },
    favorites: new Array(favs).fill({}),
  });
  const st = (v: number, p: number, d: number) => ({ VIENDO: v, POR_VER: p, DEJADO: d, FINALIZADO: 0 });

  it('gana quien tiene más en cada fila, y los empates no ganan nadie', () => {
    const rows = compareProfiles(
      profile(500, st(2, 1, 0), { serie: 3, pelicula: 0, anime: 1 }, 2),
      profile(300, st(2, 4, 1), { serie: 1, pelicula: 2, anime: 1 }, 2),
    );
    const w = Object.fromEntries(rows.map((r) => [r.key, r.winner]));
    expect(w).toMatchObject({ time: 'me', episodes: 'me', serie: 'me', pelicula: 'them', anime: 'tie', viendo: 'tie', porver: 'them', dejado: 'them', favorites: 'tie', finished: 'tie' });
    expect(rows.find((r) => r.key === 'time')).toMatchObject({ meText: '500 min', themText: '300 min' });
    expect(summarize(rows)).toEqual({ me: 3, them: 3, ties: 4 });
  });
});

describe('GET /api/profiles/:usuario/compare', () => {
  it('con un amigo devuelve las dos columnas y quién gana en cada una', async () => {
    await befriend(beto, ana); // ana y beto son amigos
    // ana: una película y una serie finalizadas; beto: nada
    await ana.put(`/api/library/${items.find((x: any) => x.type === 'pelicula').id}/status`, { status: 'FINALIZADO' });
    await ana.put(`/api/library/${items.find((x: any) => x.title === 'Breaking Bad').id}/favorite`, { value: true });
    const r = await ana.get('/api/profiles/beto/compare');
    expect(r.status).toBe(200);
    expect(r.body.access).toBe('friend');
    expect(r.body.me.username).toBe('ana');
    expect(r.body.them.username).toBe('beto');
    const byKey = Object.fromEntries(r.body.rows.map((x: any) => [x.key, x]));
    expect(byKey.episodes.me).toBeGreaterThan(0);
    expect(byKey.episodes.them).toBe(0);
    expect(byKey.episodes.winner).toBe('me');
    expect(byKey.favorites.winner).toBe('me');
    expect(byKey.anime.winner).toBe('tie'); // 0 contra 0
    expect(r.body.summary.me).toBeGreaterThan(0);
    // y desde el otro lado, al revés
    const inv = await beto.get('/api/profiles/ana/compare');
    expect(Object.fromEntries(inv.body.rows.map((x: any) => [x.key, x.winner])).episodes).toBe('them');
  });

  it('un perfil privado de alguien que no es amigo no se puede comparar', async () => {
    const r = await carla.get('/api/profiles/ana/compare');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('private');
    expect(JSON.stringify(r.body)).not.toMatch(/rows|episodes/);
  });

  it('un perfil público sí, aunque no sea amigo', async () => {
    await ana.put('/api/me/visibility', { isPublic: true, showList: false });
    const r = await carla.get('/api/profiles/ana/compare');
    expect(r.status).toBe(200);
    expect(r.body.access).toBe('public');
  });

  it('no se puede comparar con uno mismo, con quien no existe ni sin sesión', async () => {
    expect((await ana.get('/api/profiles/ana/compare')).status).toBe(400);
    expect((await ana.get('/api/profiles/nadie/compare')).status).toBe(404);
    expect((await new Client().get('/api/profiles/ana/compare')).status).toBe(401);
  });

  it('no expone el correo ni datos privados del otro', async () => {
    const r = await carla.get('/api/profiles/ana/compare');
    expect(JSON.stringify(r.body)).not.toMatch(/@test\.com|password|email/);
  });
});
