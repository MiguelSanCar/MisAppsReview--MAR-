import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { get } from '../src/db';
import { Client, startTestApp } from './client';

let app: Awaited<ReturnType<typeof startTestApp>>;
const ana = new Client();

beforeAll(async () => {
  app = await startTestApp();
  expect((await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' })).status).toBe(201);
});
afterAll(() => app.stop());

describe('búsqueda al escribir: sugerencias, tendencias y rapidez', () => {
  it('las sugerencias devuelven títulos (sin ids) y se pueden filtrar por tipo', async () => {
    const r = await ana.get('/api/search/suggest?q=brea&type=todo');
    expect(r.status).toBe(200);
    const titles = r.body.suggestions.map((s: any) => s.title);
    expect(titles).toContain('Breaking Bad');
    expect(titles).not.toContain('Anime en TMDB');
    expect(r.body.suggestions[0]).toEqual(expect.objectContaining({ title: expect.any(String), type: expect.any(String) }));
    expect(r.body.suggestions.length).toBeLessThanOrEqual(8);
    expect(new Set(titles.map((t: string) => t.toLowerCase())).size).toBe(titles.length); // sin repetidos
    expect((await ana.get('/api/search/suggest?q=a')).body.suggestions).toEqual([]);
    expect((await ana.get('/api/search/suggest?q=abc&type=nope')).status).toBe(400);
    expect((await new Client().get('/api/search/suggest?q=abc')).status).toBe(401);
  });

  it('sugerencias y búsqueda de la misma consulta comparten una sola petición a TMDB', async () => {
    const q = 'compartida' + Date.now();
    const before = app.mock.calls.filter((c) => c === '/tmdb/search/multi').length;
    await Promise.all([ana.get(`/api/search/suggest?q=${q}&type=serie`), ana.get(`/api/search?q=${q}&type=serie`)]);
    await ana.get(`/api/search?q=${q}&type=todo`);
    expect(app.mock.calls.filter((c) => c === '/tmdb/search/multi').length - before).toBe(1);
  });

  it('la búsqueda informa del tiempo que tardó', async () => {
    const r = await ana.get('/api/search?q=tiempo&type=serie');
    expect(typeof r.body.tookMs).toBe('number');
  });

  it('escribir letra a letra no vuelve a guardar los mismos contenidos', async () => {
    await ana.get('/api/search?q=estable&type=pelicula');
    const n1 = get<{ n: number }>('SELECT COUNT(*) AS n FROM content')!.n;
    await ana.get('/api/search?q=estable2&type=pelicula');
    expect(get<{ n: number }>('SELECT COUNT(*) AS n FROM content')!.n).toBe(n1);
    // y no llena la tabla de caché persistente con cada pulsación
    const c1 = get<{ n: number }>('SELECT COUNT(*) AS n FROM api_cache')!.n;
    await ana.get('/api/search?q=estable3&type=pelicula');
    expect(get<{ n: number }>('SELECT COUNT(*) AS n FROM api_cache')!.n).toBe(c1);
  });

  it('un proveedor lento no retrasa la respuesta: se devuelve lo que ya hay y se avisa', async () => {
    const base = config.jikanBase;
    const soft = config.searchSoftMs;
    config.jikanBase = app.mock.base + '/slow';
    config.searchSoftMs = 150;
    try {
      const t0 = Date.now();
      const r = await ana.get('/api/search?q=lento&type=todo');
      expect(Date.now() - t0).toBeLessThan(600);
      expect(r.body.warnings.join(' ')).toMatch(/tardando/);
      expect(r.body.results.some((x: any) => x.title === 'Breaking Bad')).toBe(true);
    } finally {
      config.jikanBase = base;
      config.searchSoftMs = soft;
    }
  });

  it('pantalla inicial: series más vistas por defecto (sin anime de TMDB), con estados del usuario', async () => {
    const r = await ana.get('/api/search/trending');
    expect(r.status).toBe(200);
    expect(r.body.title).toMatch(/Series más vistas/);
    expect(r.body.results.map((x: any) => x.title)).toEqual(['Serie en tendencia 1', 'Serie en tendencia 2']);
    expect(r.body.results.every((x: any) => x.type === 'serie')).toBe(true);
    // se pueden marcar desde la portada (tienen id local)
    const id = r.body.results[0].id;
    expect((await ana.put(`/api/library/${id}/later`, { value: true })).body.state.status).toBe('POR_VER');
    expect((await ana.get('/api/search/trending')).body.states[id].status).toBe('POR_VER');
    await ana.put(`/api/library/${id}/later`, { value: false });
  });

  it('tendencias de películas y de anime', async () => {
    expect((await ana.get('/api/search/trending?type=pelicula')).body.results.map((x: any) => x.title)).toEqual(['Película en tendencia']);
    const a = await ana.get('/api/search/trending?type=anime');
    expect(a.body.title).toMatch(/Anime/);
    expect(a.body.results.map((x: any) => x.title)).toEqual(['Anime en emisión']);
  });

  it('sin clave de TMDB la portada cae en anime en vez de quedarse vacía', async () => {
    const key = config.tmdbKey;
    config.tmdbKey = '';
    try {
      const r = await ana.get('/api/search/trending');
      expect(r.body.kind).toBe('anime');
      expect(r.body.results.length).toBe(1);
      expect((await ana.get('/api/search/trending?type=serie')).body.warnings.join(' ')).toMatch(/TMDB_API_KEY/);
    } finally {
      config.tmdbKey = key;
    }
  });
});

describe('enlaces de amistad', () => {
  const carla = new Client();
  const dani = new Client();
  const eva = new Client();
  const fran = new Client();
  let carlaId: number, daniId: number, evaId: number, token: string;

  it('preparación', async () => {
    for (const [c, n] of [[carla, 'carla'], [dani, 'dani'], [eva, 'eva'], [fran, 'fran']] as const) {
      expect((await c.post('/api/auth/register', { username: n, email: n + '@test.com', password: 'secreto123' })).status).toBe(201);
    }
    carlaId = (await carla.get('/api/auth/me')).body.user.id;
    daniId = (await dani.get('/api/auth/me')).body.user.id;
    evaId = (await eva.get('/api/auth/me')).body.user.id;
  });

  it('generar un enlace exige sesión; es siempre el mismo hasta renovarlo', async () => {
    expect((await new Client().post('/api/invites/mine')).status).toBe(401);
    const a = await carla.post('/api/invites/mine');
    token = a.body.token;
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(a.body.kind).toBe('befriend');
    expect((await carla.post('/api/invites/mine')).body.token).toBe(token);
    expect((await dani.post('/api/invites/mine')).body.token).not.toBe(token);
  });

  it('la vista previa es pública, dice quién lo generó y no filtra datos privados', async () => {
    const p = await new Client().get('/api/invites/' + token);
    expect(p.status).toBe(200);
    expect(p.body.kind).toBe('befriend');
    expect(p.body.creator.username).toBe('carla');
    expect(JSON.stringify(p.body)).not.toMatch(/email|carla@/);
    expect((await new Client().get('/api/invites/' + '0'.repeat(32))).status).toBe(404);
    expect((await new Client().get('/api/invites/no-valido')).status).toBe(404);
  });

  it('sin sesión no se puede aceptar', async () => {
    expect((await new Client().post(`/api/invites/${token}/accept`)).status).toBe(401);
  });

  it('quien abre el enlace propio de otra persona pasa a ser su amigo directamente', async () => {
    expect((await carla.post(`/api/invites/${token}/accept`)).status).toBe(400); // su propio enlace
    const r = await dani.post(`/api/invites/${token}/accept`);
    expect(r.status).toBe(200);
    expect(r.body.result).toBe('friends');
    expect(r.body.user.username).toBe('carla');
    expect((await dani.get('/api/friends')).body.friends.map((f: any) => f.username)).toEqual(['carla']);
    expect((await carla.get('/api/friends')).body.friends.map((f: any) => f.username)).toEqual(['dani']);
    expect((await dani.post(`/api/invites/${token}/accept`)).body.result).toBe('already');
  });

  it('enlace de otro perfil: solo se genera para amigos y envía una SOLICITUD a esa persona', async () => {
    expect((await carla.post(`/api/invites/request/${evaId}`)).status).toBe(403); // eva no es amiga de carla y su perfil es privado
    await eva.put('/api/me/visibility', { isPublic: true, showList: false });
    expect((await carla.post(`/api/invites/request/${evaId}`)).status).toBe(200); // un perfil público sí se puede compartir
    await eva.put('/api/me/visibility', { isPublic: false, showList: false });
    const g = await carla.post(`/api/invites/request/${daniId}`);
    expect(g.status).toBe(200);
    expect(g.body.kind).toBe('request');
    expect((await carla.post(`/api/invites/request/${daniId}`)).body.token).toBe(g.body.token);
    const p = await new Client().get('/api/invites/' + g.body.token);
    expect(p.body).toMatchObject({ kind: 'request', creator: { username: 'carla' }, target: { username: 'dani' } });

    const r = await eva.post(`/api/invites/${g.body.token}/accept`);
    expect(r.status).toBe(201);
    expect(r.body.result).toBe('requested');
    // no son amigos todavía: solicitud pendiente que dani debe aceptar
    expect((await dani.get('/api/friends')).body.incoming.map((x: any) => x.user.username)).toEqual(['eva']);
    expect((await dani.get('/api/friends')).body.friends.map((f: any) => f.username)).toEqual(['carla']);
    expect((await eva.post(`/api/invites/${g.body.token}/accept`)).body.result).toBe('pending');
    // la persona destinataria no puede usarlo contra sí misma; quien ya es amigo recibe "already"
    expect((await dani.post(`/api/invites/${g.body.token}/accept`)).status).toBe(400);
    expect((await carla.post(`/api/invites/${g.body.token}/accept`)).body.result).toBe('already');
    // si la persona destinataria ya había enviado una solicitud al que abre el enlace, se acepta
    await dani.post('/api/friends/requests', { username: 'fran' });
    expect((await fran.post(`/api/invites/${g.body.token}/accept`)).body.result).toBe('friends');
    expect((await dani.get('/api/friends')).body.friends.map((f: any) => f.username).sort()).toEqual(['carla', 'fran']);
  });

  it('en el propio perfil el enlace de «solicitud» es el de amistad normal', async () => {
    expect((await carla.post(`/api/invites/request/${carlaId}`)).body).toEqual({ token, kind: 'befriend' });
  });

  it('renovar el enlace invalida el anterior', async () => {
    const r = await carla.post('/api/invites/revoke');
    expect(r.body.token).not.toBe(token);
    expect((await new Client().get('/api/invites/' + token)).status).toBe(404);
    expect((await eva.post(`/api/invites/${token}/accept`)).status).toBe(404);
    const ok = await eva.post(`/api/invites/${r.body.token}/accept`);
    expect(ok.body.result).toBe('friends');
  });
});
