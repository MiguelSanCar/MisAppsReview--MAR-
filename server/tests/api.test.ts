import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config, DEV_JWT_SECRET } from '../src/config';
import { closeDb, openDb, run } from '../src/db';
import { startMockProviders } from './mock-providers';

let appServer: http.Server;
let port: number;
let mock: Awaited<ReturnType<typeof startMockProviders>>;

class Client {
  cookie = '';
  async req(method: string, path: string, body?: unknown) {
    return new Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders; raw: Buffer }>((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const r = http.request(
        { host: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const set = res.headers['set-cookie']?.find((c) => c.startsWith('mar_token='));
            if (set) this.cookie = set.split(';')[0] === 'mar_token=' ? '' : set.split(';')[0];
            const raw = Buffer.concat(chunks);
            let parsed: any = null;
            try { parsed = JSON.parse(raw.toString()); } catch { /* binario */ }
            resolve({ status: res.statusCode!, body: parsed, headers: res.headers, raw });
          });
        },
      );
      r.on('error', reject);
      if (data) r.write(data);
      r.end();
    });
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  put = (p: string, b?: unknown) => this.req('PUT', p, b ?? {});
  del = (p: string) => this.req('DELETE', p);
}

const ana = new Client();
const beto = new Client();
const intruso = new Client();
const anon = new Client();

beforeAll(async () => {
  await openDb(null);
  config.useRealRuntime = false; // estas pruebas parten de las duraciones fijas
  mock = await startMockProviders();
  Object.assign(config, {
    tmdbBase: `${mock.base}/tmdb`, malBase: `${mock.base}/mal`, omdbBase: `${mock.base}/omdb`,
    tmdbKey: 'tmdb-key', omdbKey: 'omdb-key', malClientId: 'mal-client', malMinGapMs: 0, authRateLimit: 10_000, jointHistoryLimit: 15,
  });
  appServer = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => appServer.once('listening', r));
  port = (appServer.address() as AddressInfo).port;
});

afterAll(async () => {
  appServer.close();
  await mock.close();
  closeDb();
});

describe('cuentas', () => {
  it('registro válido crea sesión', async () => {
    const r = await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' });
    expect(r.status).toBe(201);
    expect(r.body.user.username).toBe('ana');
    expect(r.body.user.passwordHash).toBeUndefined();
    expect((await ana.get('/api/auth/me')).body.user.username).toBe('ana');
  });

  it('valida campos y rechaza duplicados', async () => {
    const bad = await anon.post('/api/auth/register', { username: 'a', email: 'no-es-correo', password: '123' });
    expect(bad.status).toBe(400);
    expect((await anon.post('/api/auth/register', { username: 'ANA', email: 'otro@test.com', password: 'secreto123' })).status).toBe(409);
    expect((await anon.post('/api/auth/register', { username: 'otra', email: 'ANA@test.com', password: 'secreto123' })).status).toBe(409);
    expect((await anon.post('/api/auth/register', { username: 'otra', email: 'o@test.com', password: 'corta' })).body.error).toMatch(/8 caracteres/);
  });

  it('login por usuario o correo; contraseña incorrecta falla', async () => {
    expect((await anon.post('/api/auth/login', { identifier: 'ana', password: 'mala' })).status).toBe(401);
    expect((await anon.post('/api/auth/login', { identifier: 'nadie', password: 'secreto123' })).status).toBe(401);
    expect((await anon.post('/api/auth/login', { identifier: 'ana@test.com', password: 'secreto123' })).status).toBe(200);
    expect((await anon.get('/api/auth/me')).body.user.username).toBe('ana');
    await anon.post('/api/auth/logout');
    expect((await anon.get('/api/auth/me')).body.user).toBeNull();
  });

  it('las rutas privadas piden sesión', async () => {
    const guest = new Client();
    expect((await guest.get('/api/library')).status).toBe(401);
    expect((await guest.get('/api/search?q=algo')).status).toBe(401);
    expect((await guest.get('/api/me/profile')).status).toBe(401);
  });

  it('recuperar contraseña (enlace simulado) y verificar correo', async () => {
    const f = await anon.post('/api/auth/forgot', { email: 'ana@test.com' });
    expect(f.status).toBe(200);
    const token = f.body.devLink.split('/reset/')[1];
    expect((await anon.post('/api/auth/reset', { token, password: 'nueva-clave-1' })).status).toBe(200);
    expect((await anon.post('/api/auth/reset', { token, password: 'otra-clave-22' })).status).toBe(400); // un solo uso
    expect((await anon.post('/api/auth/login', { identifier: 'ana', password: 'secreto123' })).status).toBe(401);
    expect((await ana.post('/api/auth/login', { identifier: 'ana', password: 'nueva-clave-1' })).status).toBe(200);
    // no revela si el correo existe
    expect((await anon.post('/api/auth/forgot', { email: 'nadie@test.com' })).status).toBe(200);

    const v = await ana.post('/api/auth/verify/send');
    const vt = v.body.devLink.split('/verify/')[1];
    expect((await anon.post('/api/auth/verify', { token: vt })).status).toBe(200);
    expect((await ana.get('/api/auth/me')).body.user.emailVerified).toBe(true);
  });
});

describe('búsqueda y proveedores', () => {
  it('informa de qué fuentes están disponibles', async () => {
    expect((await ana.get('/api/search/status')).body).toEqual({ tmdb: true, omdb: true, mal: true });
  });

  it('combina TMDB y MyAnimeList, descarta anime de TMDB y personas', async () => {
    const r = await ana.get('/api/search?q=prueba&type=todo');
    expect(r.status).toBe(200);
    const titles = r.body.results.map((x: any) => x.title);
    expect(titles).toContain('Breaking Bad');
    expect(titles).toContain('Naruto');
    expect(titles).not.toContain('Anime en TMDB');
    expect(titles).not.toContain('Una persona');
    // entrelazado: el anime aparece pronto, no al final de 13 resultados de TMDB
    expect(titles.indexOf('Naruto')).toBeLessThan(5);
    expect(r.body.warnings).toEqual([]);
  });

  it('filtra por tipo y valida la consulta', async () => {
    const s = await ana.get('/api/search?q=prueba&type=serie');
    expect(s.body.results.every((x: any) => x.type === 'serie')).toBe(true);
    const a = await ana.get('/api/search?q=prueba&type=anime');
    expect(a.body.results.every((x: any) => x.type === 'anime')).toBe(true);
    expect((await ana.get('/api/search?q=a')).status).toBe(400);
    expect((await ana.get('/api/search?q=abc&type=otra')).status).toBe(400);
  });

  it('usa la caché: la segunda búsqueda no llama de nuevo al proveedor', async () => {
    await ana.get('/api/search?q=cacheada&type=serie');
    const before = mock.calls.filter((c) => c === '/tmdb/search/multi').length;
    await ana.get('/api/search?q=cacheada&type=serie');
    expect(mock.calls.filter((c) => c === '/tmdb/search/multi').length).toBe(before);
  });

  it('sin clave de TMDB avisa pero el anime sigue funcionando', async () => {
    const key = config.tmdbKey;
    config.tmdbKey = '';
    try {
      const r = await ana.get('/api/search?q=sinclave&type=todo');
      expect(r.body.warnings.join(' ')).toMatch(/TMDB_API_KEY/);
      expect(r.body.results.map((x: any) => x.title)).toEqual(['Naruto']);
    } finally {
      config.tmdbKey = key;
    }
  });

  it('si un proveedor falla devuelve un aviso, no un error', async () => {
    const base = config.malBase;
    config.malBase = 'http://127.0.0.1:1/mal';
    try {
      const r = await ana.get('/api/search?q=fallo&type=todo');
      expect(r.status).toBe(200);
      expect(r.body.warnings.join(' ')).toMatch(/MyAnimeList/);
      expect(r.body.results.length).toBeGreaterThan(0);
      // corte automático: la siguiente búsqueda ya no espera al proveedor caído
      config.malBase = 'http://127.0.0.1:1/mal';
      const t0 = Date.now();
      const again = await ana.get('/api/search?q=fallo2&type=todo');
      expect(again.body.warnings.join(' ')).toMatch(/MyAnimeList/);
      expect(Date.now() - t0).toBeLessThan(1500);
    } finally {
      config.malBase = base;
    }
  });
});

describe('anime desde la API oficial de MyAnimeList', () => {
  it('envía el Client ID y normaliza el resultado (título en inglés, duración en minutos, nota de MAL)', async () => {
    const r = await ana.get('/api/search?q=naruto&type=anime');
    expect(r.status).toBe(200);
    expect(r.body.warnings).toEqual([]);
    const naruto = r.body.results.find((x: any) => x.title === 'Naruto');
    expect(naruto).toMatchObject({
      source: 'mal', externalId: '20', type: 'anime', year: 2002, totalEpisodes: 220, runtimeMinutes: 23,
      studio: 'Pierrot', posterUrl: 'https://cdn.myanimelist.net/xl.jpg', releaseDate: '2002-10-03', ratings: { mal: '8.01/10' },
    });
    const ficha = await ana.get(`/api/content/${naruto.id}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.content ?? ficha.body).toBeTruthy();
  });

  it('una película de anime cuenta como 1 episodio con su duración completa', async () => {
    const { mapMal } = await import('../src/providers/mal');
    const movie = mapMal({ id: 5114, title: 'Peli', media_type: 'movie', num_episodes: 1, average_episode_duration: 6600, start_date: '2010' });
    expect(movie).toMatchObject({ totalEpisodes: 1, runtimeMinutes: 110, year: 2010, releaseDate: null });
    // Sin episodios conocidos (en emisión) → total desconocido; sin título en inglés → el original
    expect(mapMal({ id: 1, title: 'Original', alternative_titles: { en: '' }, media_type: 'tv', num_episodes: 0 }))
      .toMatchObject({ title: 'Original', totalEpisodes: null, runtimeMinutes: null });
  });

  it('con menos de 3 caracteres no se consulta MAL (lo rechazaría) y no se avisa', async () => {
    const before = mock.calls.filter((c) => c.startsWith('/mal')).length;
    const r = await ana.get('/api/search?q=nr&type=todo');
    expect(r.status).toBe(200);
    expect(r.body.warnings).toEqual([]);
    expect(mock.calls.filter((c) => c.startsWith('/mal')).length).toBe(before);
  });

  it('portada de anime: ranking de lo que está en emisión', async () => {
    const r = await ana.get('/api/search/trending?type=anime');
    expect(r.body.warnings).toEqual([]);
    expect(r.body.results.map((x: any) => x.title)).toContain('Anime en emisión');
  });

  it('sin MAL_CLIENT_ID no se llama a MAL: aviso claro en anime y nada en «Todo»', async () => {
    const id = config.malClientId;
    config.malClientId = '';
    try {
      expect((await ana.get('/api/search/status')).body.mal).toBe(false);
      const before = mock.calls.filter((c) => c.startsWith('/mal')).length;
      const todo = await ana.get('/api/search?q=sinmal&type=todo');
      expect(todo.body.warnings).toEqual([]);
      expect(todo.body.results.length).toBeGreaterThan(0);
      const anime = await ana.get('/api/search?q=sinmal&type=anime');
      expect(anime.body.results).toEqual([]);
      expect(anime.body.warnings.join(' ')).toMatch(/MAL_CLIENT_ID/);
      expect((await ana.get('/api/search/trending?type=anime')).body.warnings.join(' ')).toMatch(/MAL_CLIENT_ID/);
      expect(mock.calls.filter((c) => c.startsWith('/mal')).length).toBe(before); // ni una llamada
    } finally {
      config.malClientId = id;
    }
  });

  it('un Client ID no válido avisa sin cortar el proveedor (es un error de configuración, no una caída)', async () => {
    const id = config.malClientId;
    config.malClientId = 'otro';
    try {
      const r = await ana.get('/api/search?q=clavemal&type=anime');
      expect(r.status).toBe(200);
      expect(r.body.warnings.join(' ')).toMatch(/No se pudo consultar MyAnimeList/);
      config.malClientId = id;
      const ok = await ana.get('/api/search?q=clavebien&type=anime');
      expect(ok.body.warnings).toEqual([]);
      expect(ok.body.results.length).toBeGreaterThan(0);
    } finally {
      config.malClientId = id;
    }
  });

  it('un anime por estrenar solo admite «Por ver»', async () => {
    const { upsertFromProvider } = await import('../src/content');
    const { mapMal } = await import('../src/providers/mal');
    const row = upsertFromProvider(mapMal({ id: 7777, title: 'Anime por estrenar', media_type: 'tv', num_episodes: 0, start_date: '2099-04-01' }));
    const ficha = await ana.get(`/api/content/${row.id}`);
    expect(JSON.stringify(ficha.body)).toMatch(/"unreleased":true/);
    expect((await ana.put(`/api/library/${row.id}/status`, { status: 'VIENDO' })).status).toBe(409);
    expect((await ana.put(`/api/library/${row.id}/status`, { status: 'POR_VER' })).status).toBe(200);
    expect((await ana.del(`/api/library/${row.id}`)).status).toBe(200); // no altera los recuentos de las pruebas siguientes
  });
});

describe('biblioteca: favoritos, ver más tarde, estados y episodios', () => {
  let tv: any, movie: any, anm: any, all: any[];

  it('prepara resultados', async () => {
    all = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
    tv = all.find((x) => x.title === 'Breaking Bad');
    movie = all.find((x) => x.title === 'Pelicula 1');
    anm = all.find((x) => x.title === 'Naruto');
    expect(tv.totalEpisodes).toBeNull(); // se conoce al abrir la ficha
    expect(movie.totalEpisodes).toBe(1);
  });

  it('favorito en película: pasa a Finalizado con 1 episodio', async () => {
    const r = await ana.put(`/api/library/${movie.id}/favorite`, { value: true });
    expect(r.body.state).toMatchObject({ status: 'FINALIZADO', watched: 1, favorite: true });
  });

  it('favorito en serie: completa los episodios totales de la ficha', async () => {
    const r = await ana.put(`/api/library/${tv.id}/favorite`, { value: true });
    expect(r.body.state).toMatchObject({ status: 'FINALIZADO', watched: 62, favorite: true });
    expect(r.body.totalEpisodes).toBe(62);
  });

  it('quitar favorito no cambia estado ni episodios', async () => {
    const r = await ana.put(`/api/library/${tv.id}/favorite`, { value: false });
    expect(r.body.state).toMatchObject({ status: 'FINALIZADO', watched: 62, favorite: false });
    await ana.put(`/api/library/${tv.id}/favorite`, { value: true });
  });

  it('máximo 10 favoritos: el 11º da error claro', async () => {
    const movies = all.filter((x) => x.type === 'pelicula'); // 12
    let n = 2; // ya hay 2 (película 1 y serie)
    for (const m of movies.slice(1)) {
      const r = await ana.put(`/api/library/${m.id}/favorite`, { value: true });
      if (n < 10) { expect(r.status).toBe(200); n++; }
      else { expect(r.status).toBe(409); expect(r.body.error).toMatch(/10 favoritos/); break; }
    }
    expect(n).toBe(10);
    // el favorito ya existente se puede "volver a marcar" sin error
    expect((await ana.put(`/api/library/${movie.id}/favorite`, { value: true })).status).toBe(200);
  });

  it('ver más adelante alterna y limpia si no hay progreso', async () => {
    let r = await ana.put(`/api/library/${anm.id}/later`, { value: true });
    expect(r.body.state).toMatchObject({ status: 'POR_VER', watched: 0 });
    r = await ana.put(`/api/library/${anm.id}/later`, { value: false });
    expect(r.body.state).toBeNull();
  });

  it('episodios: sube, tope en el máximo → Finalizado, rechaza no numéricos', async () => {
    let r = await ana.put(`/api/library/${anm.id}/episodes`, { watched: 5 });
    expect(r.body.state).toMatchObject({ status: 'VIENDO', watched: 5 });
    expect(r.body.totalEpisodes).toBe(220);
    r = await ana.put(`/api/library/${anm.id}/episodes`, { watched: 9999 });
    expect(r.body.state).toMatchObject({ status: 'FINALIZADO', watched: 220 });
    r = await ana.put(`/api/library/${anm.id}/episodes`, { watched: 219 });
    expect(r.body.state).toMatchObject({ status: 'VIENDO', watched: 219 });
    expect((await ana.put(`/api/library/${anm.id}/episodes`, { watched: 'abc' })).status).toBe(400);
    expect((await ana.put(`/api/library/${anm.id}/episodes`, { watched: -1 })).status).toBe(400);
    expect((await ana.put(`/api/library/${anm.id}/episodes`, { watched: 1.5 })).status).toBe(400);
  });

  it('cambio manual de estado', async () => {
    const r = await ana.put(`/api/library/${anm.id}/status`, { status: 'DEJADO' });
    expect(r.body.state).toMatchObject({ status: 'DEJADO', watched: 219 });
    expect((await ana.put(`/api/library/${anm.id}/status`, { status: 'XXX' })).status).toBe(400);
  });

  it('lista con filtros', async () => {
    expect((await ana.get('/api/library?status=DEJADO')).body.items.map((i: any) => i.title)).toEqual(['Naruto']);
    expect((await ana.get('/api/library?favorite=1')).body.items.length).toBe(10);
    expect((await ana.get('/api/library?type=anime')).body.items.length).toBe(1);
    expect((await ana.get('/api/library?status=NOPE')).status).toBe(400);
  });

  it('ficha: puntuaciones IMDb + Rotten Tomatoes (serie) y MAL (anime)', async () => {
    const t = await ana.get(`/api/content/${tv.id}`);
    expect(t.body.content.ratings).toEqual({ imdb: '9.5/10', rottenTomatoes: '96%' });
    expect(t.body.content.studio).toBe('Sony · AMC');
    expect(t.body.state.favorite).toBe(true);
    const a = await ana.get(`/api/content/${anm.id}`);
    expect(a.body.content.ratings.mal).toBe('8.01/10');
    expect(a.body.content.studio).toBe('Pierrot');
    const m = await ana.get(`/api/content/${movie.id}`);
    expect(m.body.content.ratings.rottenTomatoes).toBeUndefined(); // RT puede no venir
    expect(m.body.content.ratings.imdb).toBe('7.1/10');
  });

  it('la caché evita repetir la consulta de OMDb', async () => {
    const before = mock.calls.filter((c) => c === '/omdb/').length;
    await ana.get(`/api/content/${tv.id}`);
    expect(mock.calls.filter((c) => c === '/omdb/').length).toBe(before);
  });

  it('contenido inexistente → 404', async () => {
    expect((await ana.get('/api/content/99999')).status).toBe(404);
    expect((await ana.get('/api/content/abc')).status).toBe(400);
  });
});

describe('perfil y estadísticas', () => {
  it('horas totales con duración fija y formato escalonado', async () => {
    const p = (await ana.get('/api/me/profile')).body;
    // 10 favoritos = 9 películas (1 ep × 90 min) + 1 serie (62 ep × 50 min); más el anime (219 ep × 23 min)
    expect(p.stats.totalMinutes).toBe(9 * 90 + 62 * 50 + 219 * 23);
    expect(p.stats.watchTime.text).toMatch(/^\d+(,\d)? (horas|días|semanas|meses|años?|semana|día|mes|hora)$/);
    expect(p.favorites.length).toBe(10);
    expect(p.stats.byStatus.DEJADO).toBe(1);
  });
});

describe('perfiles con URL propia y visibilidad', () => {
  it('por defecto el perfil es solo para amigos: un desconocido solo ve que existe y es privado', async () => {
    expect((await ana.get('/api/auth/me')).body.user).toMatchObject({ profilePublic: false, showList: false });
    const r = await anon.get('/api/profiles/ana');
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'private', relation: 'anonymous', user: { username: 'ana' } });
    expect(JSON.stringify(r.body)).not.toMatch(/email|favorites|stats|ana@test/);
    expect((await anon.get('/api/profiles/nadie-existe')).status).toBe(404);
  });

  it('el propio perfil siempre se ve, y la dirección no distingue mayúsculas', async () => {
    const r = await ana.get('/api/profiles/ANA');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ access: 'self', canSeeList: true, canSeeFriends: true });
    expect(r.body.user.username).toBe('ana');
  });

  it('público: cualquiera lo ve sin cuenta, sin datos privados; la lista solo si se permite', async () => {
    const v = await ana.put('/api/me/visibility', { isPublic: true, showList: false });
    expect(v.body.user).toMatchObject({ profilePublic: true, showList: false });
    const r = await anon.get('/api/profiles/ana');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ access: 'public', canSeeList: false, canSeeFriends: false });
    expect(r.body.user.email).toBeUndefined();
    expect(r.body.favorites.length).toBe(10);
    expect((await anon.get('/api/profiles/ana/library')).body).toMatchObject({ code: 'list_hidden' });
    expect((await anon.get('/api/profiles/ana/friends')).status).toBe(403);

    await ana.put('/api/me/visibility', { isPublic: true, showList: true });
    const lib = await anon.get('/api/profiles/ana/library');
    expect(lib.status).toBe(200);
    expect(lib.body.items.length).toBeGreaterThan(5);
    expect((await anon.get('/api/profiles/ana/friends')).status).toBe(403); // los amigos nunca son públicos
    expect((await anon.put('/api/library/1/favorite', { value: false })).status).toBe(401); // solo lectura
  });

  it('un perfil público también lo ve cualquier persona con sesión que no sea amiga', async () => {
    await intruso.post('/api/auth/register', { username: 'intruso', email: 'i@test.com', password: 'secreto123' });
    const r = await intruso.get('/api/profiles/ana');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ access: 'public', relation: 'none' });
  });

  it('volver a privado lo oculta de nuevo', async () => {
    await ana.put('/api/me/visibility', { isPublic: false, showList: false });
    expect((await anon.get('/api/profiles/ana')).status).toBe(403);
    expect((await intruso.get('/api/profiles/ana')).body.code).toBe('private');
  });

  it('valida la petición de visibilidad', async () => {
    expect((await ana.put('/api/me/visibility', { isPublic: 'si', showList: false })).status).toBe(400);
    expect((await anon.put('/api/me/visibility', { isPublic: true, showList: false })).status).toBe(401);
  });

  it('equivalencia id → usuario (para redirigir /friend/<número>): exige sesión', async () => {
    expect((await anon.get('/api/profiles/by-id/1')).status).toBe(401);
    expect((await ana.get('/api/profiles/by-id/1')).body.username).toBe('ana');
    expect((await ana.get('/api/profiles/by-id/99999')).status).toBe(404);
  });

  it('los enlaces antiguos /u/<token> solo redirigen si el perfil es público', async () => {
    const token = 'a'.repeat(32);
    run('UPDATE users SET share_token = ? WHERE username = ?', [token, 'ana']);
    expect((await anon.get('/api/public/' + token)).status).toBe(404); // privado
    run('UPDATE users SET profile_public = 1 WHERE username = ?', ['ana']);
    expect((await anon.get('/api/public/' + token)).body).toEqual({ username: 'ana' });
    run('UPDATE users SET profile_public = 0 WHERE username = ?', ['ana']);
    expect((await anon.get('/api/public/' + 'b'.repeat(32))).status).toBe(404);
  });
});

describe('avatar y exportación', () => {
  // PNG 1x1 válido
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  it('acepta imágenes válidas y las sirve con su tipo', async () => {
    const r = await ana.put('/api/me/avatar', { dataUrl: png });
    expect(r.body.user.avatarUrl).toMatch(/^\/api\/avatar\/\d+\?v=1$/);
    const img = await anon.get(r.body.user.avatarUrl);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
  });
  it('rechaza SVG, texto o imágenes falsas', async () => {
    expect((await ana.put('/api/me/avatar', { dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })).status).toBe(400);
    expect((await ana.put('/api/me/avatar', { dataUrl: 'data:image/png;base64,' + Buffer.from('<script>').toString('base64') })).status).toBe(400);
    expect((await ana.put('/api/me/avatar', { dataUrl: 'hola' })).status).toBe(400);
  });
  it('exporta los datos en JSON', async () => {
    const r = await ana.get('/api/me/export');
    expect(r.headers['content-disposition']).toMatch(/attachment/);
    expect(r.body.contenidos.length).toBeGreaterThan(5);
    expect(r.body.usuario.nombre).toBe('ana');
  });
});

describe('amigos', () => {
  it('registro de la segunda persona y solicitud de amistad', async () => {
    await beto.post('/api/auth/register', { username: 'beto', email: 'beto@test.com', password: 'secreto123' });
    await intruso.post('/api/auth/register', { username: 'intruso', email: 'i@test.com', password: 'secreto123' });
    expect((await ana.post('/api/friends/requests', { username: 'ana' })).status).toBe(400);
    expect((await ana.post('/api/friends/requests', { username: 'nadie' })).status).toBe(404);
    expect((await ana.post('/api/friends/requests', { username: 'beto' })).status).toBe(201);
    expect((await ana.post('/api/friends/requests', { username: 'beto' })).status).toBe(409);
  });

  it('antes de aceptar no se puede ver su perfil', async () => {
    const r = await ana.get('/api/profiles/beto');
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'private', relation: 'pending_out' });
    expect((await beto.get('/api/profiles/ana')).body).toMatchObject({ code: 'private', relation: 'pending_in' });
  });

  it('beto acepta y ambos se ven', async () => {
    const list = (await beto.get('/api/friends')).body;
    expect(list.incoming.length).toBe(1);
    expect((await ana.post(`/api/friends/requests/${list.incoming[0].id}/accept`)).status).toBe(404); // solo el destinatario
    expect((await beto.post(`/api/friends/requests/${list.incoming[0].id}/accept`)).status).toBe(200);
    expect((await ana.get('/api/friends')).body.friends.map((f: any) => f.username)).toEqual(['beto']);
  });

  it('un amigo ve perfil, lista y amigos; un desconocido no', async () => {
    const p = await beto.get('/api/profiles/ana');
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ access: 'friend', canSeeList: true, canSeeFriends: true });
    expect(p.body.favorites.length).toBe(10);
    expect((await beto.get('/api/profiles/ana/library')).body.items.length).toBeGreaterThan(5);
    expect((await beto.get('/api/profiles/ana/friends')).body.friends.map((f: any) => f.username)).toEqual(['beto']);
    // un desconocido: el perfil es privado
    expect((await intruso.get('/api/profiles/ana')).status).toBe(403);
    expect((await intruso.get('/api/profiles/ana/library')).status).toBe(403);
    expect((await intruso.get('/api/profiles/ana/friends')).status).toBe(403);
  });

  it('auto-acepta si la otra persona ya había enviado solicitud', async () => {
    await intruso.post('/api/friends/requests', { username: 'ana' });
    const r = await ana.post('/api/friends/requests', { username: 'intruso' });
    expect(r.body.accepted).toBe(true);
    expect((await intruso.get('/api/profiles/ana')).body).toMatchObject({ access: 'friend' }); // ahora son amigos
    await ana.del(`/api/friends/${(await intruso.get('/api/auth/me')).body.user.id}`);
    expect((await intruso.get('/api/profiles/ana')).status).toBe(403);
  });
});

describe('listas conjuntas con historial y rollback', () => {
  let listId: number, movieId: number, animeId: number;

  it('solo se crean con amigos', async () => {
    const betoId = (await beto.get('/api/auth/me')).body.user.id;
    const intrusoId = (await intruso.get('/api/auth/me')).body.user.id;
    expect((await ana.post('/api/lists', { name: 'X', friendId: intrusoId })).status).toBe(400);
    const r = await ana.post('/api/lists', { name: 'Para ver juntos', friendId: betoId });
    expect(r.status).toBe(201);
    listId = r.body.id;
    const res = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
    movieId = res.find((x: any) => x.title === 'Pelicula 2').id;
    animeId = res.find((x: any) => x.title === 'Naruto').id;
  });

  it('ambos ven la lista; un tercero no', async () => {
    expect((await beto.get(`/api/lists/${listId}`)).body.list.members.map((m: any) => m.username).sort()).toEqual(['ana', 'beto']);
    expect((await intruso.get(`/api/lists/${listId}`)).status).toBe(404);
    expect((await intruso.get('/api/lists')).body.lists).toEqual([]);
  });

  it('ambos pueden añadir y modificar; todo queda en el historial con su autor', async () => {
    expect((await ana.post(`/api/lists/${listId}/items`, { contentId: animeId })).status).toBe(201);
    expect((await beto.post(`/api/lists/${listId}/items`, { contentId: animeId })).status).toBe(409);
    expect((await beto.put(`/api/lists/${listId}/items/${animeId}`, { watched: 10 })).body.state).toMatchObject({ status: 'VIENDO', watched: 10 });
    expect((await ana.put(`/api/lists/${listId}/items/${animeId}`, { status: 'DEJADO' })).body.state.status).toBe('DEJADO');
    const h = (await ana.get(`/api/lists/${listId}/items/${animeId}/history`)).body.history;
    expect(h.map((e: any) => `${e.user}:${e.action}`)).toEqual(['ana:status', 'beto:episodes', 'ana:add']);
  });

  it('un cambio sin efecto no ensucia el historial', async () => {
    await ana.put(`/api/lists/${listId}/items/${animeId}`, { watched: 10 });
    expect((await ana.get(`/api/lists/${listId}/items/${animeId}/history`)).body.history.length).toBe(3);
  });

  it('rollback restaura el punto elegido y queda registrado', async () => {
    const h = (await ana.get(`/api/lists/${listId}/items/${animeId}/history`)).body.history;
    const toEpisodes = h.find((e: any) => e.action === 'episodes');
    const r = await ana.post(`/api/lists/${listId}/items/${animeId}/rollback`, { historyId: toEpisodes.id });
    expect(r.body.state).toEqual({ status: 'VIENDO', watched: 10 });
    const after = (await beto.get(`/api/lists/${listId}`)).body.items[0].state;
    expect(after).toEqual({ status: 'VIENDO', watched: 10 });
    const h2 = (await ana.get(`/api/lists/${listId}/items/${animeId}/history`)).body.history;
    expect(h2[0]).toMatchObject({ user: 'ana', action: 'rollback' });
    expect(h2.length).toBe(4);
  });

  it('rollback de otro contenido o inexistente falla', async () => {
    expect((await ana.post(`/api/lists/${listId}/items/${animeId}/rollback`, { historyId: 99999 })).status).toBe(404);
  });

  it('el historial se recorta a las últimas N (mínimo 15) entradas', async () => {
    await ana.post(`/api/lists/${listId}/items`, { contentId: movieId });
    for (let i = 1; i <= 25; i++) {
      // alterna Dejado/Por ver para generar cambios reales
      await ana.put(`/api/lists/${listId}/items/${movieId}`, { status: i % 2 ? 'DEJADO' : 'POR_VER' });
    }
    const all = (await ana.get(`/api/lists/${listId}/history`)).body.history;
    expect(all.length).toBe(config.jointHistoryLimit);
    expect(config.jointHistoryLimit).toBeGreaterThanOrEqual(15);
  });

  it('borrar el contenido se registra y se puede deshacer con rollback', async () => {
    const before = (await ana.get(`/api/lists/${listId}`)).body.items.length;
    await beto.del(`/api/lists/${listId}/items/${movieId}`);
    expect((await ana.get(`/api/lists/${listId}`)).body.items.length).toBe(before - 1);
    const h = (await ana.get(`/api/lists/${listId}/items/${movieId}/history`)).body.history;
    const prev = h.find((e: any) => e.action === 'status');
    await ana.post(`/api/lists/${listId}/items/${movieId}/rollback`, { historyId: prev.id });
    expect((await ana.get(`/api/lists/${listId}`)).body.items.length).toBe(before);
  });

  it('solo quien la creó puede borrar la lista', async () => {
    expect((await beto.del(`/api/lists/${listId}`)).status).toBe(403);
    expect((await ana.del(`/api/lists/${listId}`)).status).toBe(200);
    expect((await beto.get(`/api/lists/${listId}`)).status).toBe(404);
  });
});

describe('roadmap público', () => {
  it('se lee sin sesión', async () => {
    const r = await anon.get('/api/roadmap');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.phases)).toBe(true);
  });
  it('no hay endpoints de escritura del roadmap', async () => {
    expect((await anon.put('/api/roadmap', {})).status).toBe(404);
  });
});

describe('seguridad básica', () => {
  it('detrás del túnel (X-Forwarded-Proto: https desde loopback) la cookie es Secure', async () => {
    const r = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const body = JSON.stringify({ username: 'tunelito', email: 'tunelito@test.com', password: 'secreto123' });
      const q = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/auth/register', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '20.1.2.3' } }, (res) => { res.resume(); resolve(res); });
      q.on('error', reject); q.end(body);
    });
    expect(r.statusCode).toBe(201);
    expect(String(r.headers['set-cookie'])).toMatch(/Secure/);
  });
  it('health informa del secreto por defecto fuera de producción', async () => {
    const real = config.jwtSecret;
    try {
      config.jwtSecret = DEV_JWT_SECRET;
      expect((await anon.get('/api/health')).body).toEqual({ ok: true, devSecret: true });
      config.jwtSecret = 'otro-secreto-largo';
      expect((await anon.get('/api/health')).body).toEqual({ ok: true, devSecret: false });
    } finally {
      config.jwtSecret = real;
    }
  });
  it('cabeceras de helmet y cookie httpOnly', async () => {
    const r = await anon.get('/api/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
  });
  it('limita los intentos de login', async () => {
    const prev = config.authRateLimit;
    config.authRateLimit = 3;
    try {
      const c = new Client();
      const codes: number[] = [];
      for (let i = 0; i < 8; i++) codes.push((await c.post('/api/auth/login', { identifier: 'ana', password: 'x' })).status);
      expect(codes).toContain(429);
    } finally {
      config.authRateLimit = prev;
    }
  });
  it('JSON inválido da 400 y rutas API desconocidas 404', async () => {
    expect((await anon.get('/api/no-existe')).status).toBe(404);
  });
});
