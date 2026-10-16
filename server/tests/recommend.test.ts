import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { get, run } from '../src/db';
import {
  candidateScore, FAVORITE_BOOST, genreAffinity, itemWeight, LibItem, mapGenres, MIN_MARKET, rankCandidates, STATUS_WEIGHT,
} from '../src/domain/recommend';
import { Client, startTestApp } from './client';

const it_ = (genres: number[], status: LibItem['status'] = 'FINALIZADO', favorite = false, kind: LibItem['kind'] = 'serie'): LibItem => ({ kind, genres, status, favorite });

describe('afinidad por género (fórmula pura)', () => {
  const market = { 18: 0.5, 27: 0.05, 35: 0.2 }; // el Drama abunda; el Terror casi no

  it('cada contenido visto suma 1; los favoritos pesan más; por ver y dejado, menos', () => {
    expect(itemWeight(it_([18]))).toBe(1);
    expect(itemWeight(it_([18], 'FINALIZADO', true))).toBe(FAVORITE_BOOST);
    expect(itemWeight(it_([18], 'POR_VER'))).toBe(STATUS_WEIGHT.POR_VER);
    expect(itemWeight(it_([18], 'DEJADO'))).toBeLessThan(itemWeight(it_([18], 'POR_VER')));
    expect(STATUS_WEIGHT.FINALIZADO).toBeGreaterThan(STATUS_WEIGHT.VIENDO);
  });

  it('con la misma cantidad, el género raro en el mercado puntúa más que el abundante', () => {
    const items = [it_([18]), it_([18]), it_([27]), it_([27])];
    const s = genreAffinity(items, 'serie', market);
    const drama = s.find((g) => g.id === 18)!;
    const terror = s.find((g) => g.id === 27)!;
    expect(drama.weight).toBe(terror.weight);
    expect(terror.lift).toBeGreaterThan(drama.lift);
    expect(terror.score).toBeGreaterThan(drama.score);
    expect(s[0].id).toBe(27);
  });

  it('pero tener muchos más contenidos de un género abundante sí lo adelanta', () => {
    const items = [...Array(10)].map(() => it_([18])).concat([it_([27])]);
    const s = genreAffinity(items, 'serie', market);
    expect(s[0].id).toBe(18);
  });

  it('un favorito pesa más que un contenido normal del mismo género', () => {
    const a = genreAffinity([it_([35], 'FINALIZADO', true), it_([18])], 'serie', market);
    expect(a[0].id).toBe(35);
    const b = genreAffinity([it_([35]), it_([18])], 'serie', { 18: 0.2, 35: 0.2 }); // mismo mercado, mismo peso: empate
    expect(b[0].score).toBeCloseTo(b[1].score, 10);
  });

  it('con pocos datos no se dispara: la presencia propia se acerca a la media del mercado', () => {
    const one = genreAffinity([it_([27])], 'serie', market)[0];
    const many = genreAffinity([...Array(20)].map(() => it_([27])), 'serie', market)[0];
    expect(one.lift).toBeLessThan(many.lift);
    expect(one.userShare).toBe(1);
    expect(Number.isFinite(one.score)).toBe(true);
  });

  it('un género ausente del mercado no divide por cero', () => {
    const s = genreAffinity([it_([9999])], 'serie', {});
    expect(s[0].marketShare).toBe(MIN_MARKET);
    expect(Number.isFinite(s[0].score)).toBe(true);
  });

  it('sin contenidos (o solo con peso nulo) no hay afinidad', () => {
    expect(genreAffinity([], 'serie', market)).toEqual([]);
  });

  it('los géneros se traducen entre series y películas', () => {
    expect(mapGenres([28, 12], 'pelicula', 'serie')).toEqual([10759]); // Acción y Aventura → «Action & Adventure»
    expect(mapGenres([10765], 'serie', 'pelicula').sort()).toEqual([14, 878]);
    expect(mapGenres([18, 35], 'pelicula', 'serie').sort()).toEqual([18, 35]); // mismos ids en ambos catálogos
    expect(mapGenres([27], 'pelicula', 'serie')).toEqual([27]);
    const s = genreAffinity([it_([28], 'FINALIZADO', false, 'pelicula')], 'serie', { 10759: 0.2 });
    expect(s.map((g) => g.id)).toEqual([10759]);
  });

  it('los candidatos se ordenan por encaje, con algo más de peso a la nota y la popularidad como desempate', () => {
    const scores = genreAffinity([it_([18]), it_([18]), it_([80])], 'serie', { 18: 0.5, 80: 0.1 });
    const ranked = rankCandidates(
      [
        { index: 0, genres: [18], voteAverage: 6.5 },
        { index: 1, genres: [18, 80], voteAverage: 6.5 }, // dos géneros afines
        { index: 2, genres: [18], voteAverage: 9 },       // mismo encaje que el 0 pero mejor nota
        { index: 3, genres: [18], voteAverage: 9 },       // idéntico al 2: manda la popularidad (índice menor)
        { index: 4, genres: [999], voteAverage: 9.5 },    // sin ningún género afín: fuera
      ],
      scores,
    );
    expect(ranked.map((c) => c.index)).toEqual([1, 2, 3, 0]);
    expect(candidateScore({ index: 0, genres: [], voteAverage: 9 }, new Map())).toBe(0);
  });
});

describe('GET /api/recommendations', () => {
  let app: Awaited<ReturnType<typeof startTestApp>>;
  const ana = new Client();
  const nueva = new Client();
  let bb: any;
  let peli: any;

  beforeAll(async () => {
    app = await startTestApp();
    await ana.post('/api/auth/register', { username: 'ana', email: 'ana@test.com', password: 'secreto123' });
    await nueva.post('/api/auth/register', { username: 'nueva', email: 'nueva@test.com', password: 'secreto123' });
    const res = (await ana.get('/api/search?q=prueba&type=todo')).body.results;
    bb = res.find((x: any) => x.title === 'Breaking Bad');
    peli = res.find((x: any) => x.type === 'pelicula');
  });
  afterAll(() => app.stop());

  it('sin nada en la lista no hay recomendaciones y se explica por qué', async () => {
    const r = await nueva.get('/api/recommendations');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ reason: 'sin_datos', items: [], genres: [], title: 'Series que has podido ver' });
  });

  it('los géneros se guardan al buscar y al abrir la ficha', async () => {
    expect(JSON.parse(get<{ genres: string }>('SELECT genres FROM content WHERE id = ?', [bb.id])!.genres)).toEqual([18]); // de la búsqueda
    await ana.put(`/api/library/${bb.id}/status`, { status: 'FINALIZADO' }); // abre la ficha: géneros completos del detalle
    expect(JSON.parse(get<{ genres: string }>('SELECT genres FROM content WHERE id = ?', [bb.id])!.genres)).toEqual([18, 80]);
  });

  it('recomienda series de tus géneros con más afinidad y no repite lo que ya tienes', async () => {
    const r = await ana.get('/api/recommendations?type=serie');
    expect(r.status).toBe(200);
    expect(r.body.reason).toBeNull();
    expect(r.body.genres.length).toBeGreaterThan(0);
    expect(r.body.genres.map((g: any) => g.name)).toEqual(expect.arrayContaining(['Drama']));
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.length).toBeLessThanOrEqual(20);
    expect(r.body.items.map((i: any) => i.id)).not.toContain(bb.id); // Breaking Bad ya está en la lista
    expect(new Set(r.body.items.map((i: any) => i.id)).size).toBe(r.body.items.length); // sin duplicados
    expect(r.body.items.every((i: any) => i.type === 'serie')).toBe(true);
    expect(r.body.items.some((i: any) => i.why === 'Drama')).toBe(true); // se explica el motivo
    expect(r.body.states).toEqual({}); // ninguna recomendación está ya en tu lista: no hay estado que pintar
    // cada género trae sus números para entender la puntuación
    for (const g of r.body.genres) expect(g).toMatchObject({ id: expect.any(Number), score: expect.any(Number), lift: expect.any(Number), marketShare: expect.any(Number) });
  });

  it('la cuota de mercado se calcula una vez al día (caché)', async () => {
    const before = app.mock.calls.filter((c) => c === '/tmdb/discover/tv').length;
    await ana.get('/api/recommendations?type=serie');
    await ana.get('/api/recommendations?type=serie');
    // las consultas por género también están en caché: no hay más peticiones al proveedor
    expect(app.mock.calls.filter((c) => c === '/tmdb/discover/tv').length).toBe(before);
  });

  it('las películas se recomiendan con los géneros de las películas (y las series aportan los que equivalen)', async () => {
    await ana.put(`/api/library/${peli.id}/status`, { status: 'FINALIZADO' });
    const r = await ana.get('/api/recommendations?type=pelicula');
    expect(r.body.title).toBe('Películas que has podido ver');
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((i: any) => i.type === 'pelicula')).toBe(true);
    expect(r.body.genres.map((g: any) => g.id)).toContain(28); // Acción, de la película que ha visto
  });

  it('completa los géneros de lo que se guardó antes de existir la columna', async () => {
    run('UPDATE content SET genres = NULL WHERE id = ?', [bb.id]);
    const r = await ana.get('/api/recommendations?type=serie');
    expect(r.body.reason).toBeNull();
    expect(get<{ genres: string }>('SELECT genres FROM content WHERE id = ?', [bb.id])!.genres).toBe('[18,80]');
  });

  it('pagina: cada página trae candidatos nuevos de tus géneros, sin repetir, hasta el límite de TMDB (500 páginas)', async () => {
    const p1 = await ana.get('/api/recommendations?type=serie');
    const p2 = await ana.get('/api/recommendations?type=serie&page=2');
    expect(p1.body.page).toBe(1);
    expect(p1.body.hasMore).toBe(true);
    expect(p2.status).toBe(200);
    expect(p2.body.page).toBe(2);
    expect(p2.body.items.length).toBeGreaterThan(0);
    const ids1 = p1.body.items.map((i: any) => i.id);
    expect(p2.body.items.filter((i: any) => ids1.includes(i.id))).toEqual([]); // la segunda página no repite la primera
    expect(p2.body.items.map((i: any) => i.id)).not.toContain(bb.id); // y sigue excluyendo lo que ya tienes
    const last = await ana.get('/api/recommendations?type=serie&page=500');
    expect(last.body.hasMore).toBe(false); // límite de páginas
  });

  it('valida la página', async () => {
    for (const q of ['page=0', 'page=501', 'page=x', 'page=1.5', 'page=-1']) expect((await ana.get('/api/recommendations?type=serie&' + q)).status, q).toBe(400);
  });

  it('anime todavía no (Jikan no da géneros), tipo no válido y sin sesión', async () => {
    const r = await ana.get('/api/recommendations?type=anime');
    expect(r.body).toMatchObject({ reason: 'anime', items: [] });
    expect((await ana.get('/api/recommendations?type=cosas')).status).toBe(400);
    expect((await new Client().get('/api/recommendations')).status).toBe(401);
  });

  it('sin clave de TMDB no falla: lo indica', async () => {
    const key = config.tmdbKey;
    config.tmdbKey = '';
    try {
      expect((await ana.get('/api/recommendations')).body).toMatchObject({ reason: 'sin_tmdb', items: [] });
    } finally {
      config.tmdbKey = key;
    }
  });

  it('un género favorito pesa más: con dos favoritos de Comedia sube por encima del Drama', async () => {
    const otra = new Client();
    await otra.post('/api/auth/register', { username: 'otra', email: 'otra@test.com', password: 'secreto123' });
    // contenidos de prueba con géneros conocidos, insertados directamente
    const uid = get<{ id: number }>("SELECT id FROM users WHERE username = 'otra'")!.id;
    const mk = (n: number, genres: number[], fav: number) => {
      const { lastId } = run("INSERT INTO content (source, external_id, type, title, genres, detailed_at) VALUES ('tmdb', ?, 'serie', ?, ?, '2026-01-01')", [`tv-x${n}`, `X${n}`, JSON.stringify(genres)]);
      run("INSERT INTO user_content (user_id, content_id, status, watched_episodes, is_favorite, updated_at) VALUES (?, ?, 'FINALIZADO', 1, ?, '2026-01-01T00:00:00.000Z')", [uid, lastId, fav]);
    };
    mk(1, [18], 0); mk(2, [18], 0); mk(3, [35], 1); mk(4, [35], 1);
    const r = await otra.get('/api/recommendations?type=serie');
    const order = r.body.genres.map((g: any) => g.id);
    expect(order[0]).toBe(35);
    expect(order).toContain(18);
  });
});
