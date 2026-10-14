import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { get, run } from '../src/db';
import { Client, startTestApp } from './client';

let app: Awaited<ReturnType<typeof startTestApp>>;
const pag = new Client();
const otra = new Client();
let userId = 0;

const STATUS = ['POR_VER', 'VIENDO', 'FINALIZADO', 'DEJADO'];
const TYPES = ['serie', 'pelicula', 'anime'];

beforeAll(async () => {
  app = await startTestApp();
  const r = await pag.post('/api/auth/register', { username: 'pag', email: 'pag@test.com', password: 'secreto123' });
  userId = r.body.user.id;
  await otra.post('/api/auth/register', { username: 'otra', email: 'otra@test.com', password: 'secreto123' });
  // 60 contenidos con fechas de actividad distintas: el 59 es el más reciente
  for (let i = 0; i < 60; i++) {
    const { lastId } = run('INSERT INTO content (source, external_id, type, title) VALUES (?, ?, ?, ?)', ['tmdb', `tv-${i}`, TYPES[i % 3], `Título ${String(i).padStart(2, '0')}`]);
    const when = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
    run('INSERT INTO user_content (user_id, content_id, status, watched_episodes, is_favorite, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [userId, lastId, STATUS[i % 4], i % 10 === 0 ? 1 : 0, when]);
  }
});
afterAll(() => app.stop());

/** Recorre todos los lotes con el cursor y devuelve los ids en orden. */
async function walk(query = '', limit = 24) {
  const ids: number[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const r: any = await pag.get(`/api/library?limit=${limit}${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    expect(r.status).toBe(200);
    ids.push(...r.body.items.map((i: any) => i.id));
    cursor = r.body.nextCursor;
    pages++;
  } while (cursor && pages < 50);
  return { ids, pages };
}

describe('lista paginada con cursor', () => {
  it('el primer lote trae 24 contenidos, el total y los contadores de las pestañas', async () => {
    const r = await pag.get('/api/library');
    expect(r.body.items).toHaveLength(24);
    expect(r.body.total).toBe(60);
    expect(r.body.nextCursor).toBeTruthy();
    expect(r.body.counts).toEqual({ todos: 60, favoritos: 6, POR_VER: 15, VIENDO: 15, FINALIZADO: 15, DEJADO: 15 });
    // más reciente primero
    expect(r.body.items[0].title).toBe('Título 59');
  });

  it('recorrer los lotes devuelve los 60 una sola vez y en orden, y el último no tiene cursor', async () => {
    const { ids, pages } = await walk();
    expect(pages).toBe(3); // 24 + 24 + 12
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    const titles = (await pag.get('/api/library?limit=60')).body.items.map((i: any) => i.title);
    expect(titles[0]).toBe('Título 59');
    expect(titles[59]).toBe('Título 00');
    const last = await pag.get(`/api/library?limit=24&cursor=${encodeURIComponent((await pag.get('/api/library?limit=48')).body.nextCursor)}`);
    expect(last.body.items).toHaveLength(12);
    expect(last.body.nextCursor).toBeNull();
    expect(last.body.counts).toBeUndefined(); // los contadores solo van en el primer lote
  });

  it('los filtros (estado, tipo, favoritos, título) cuentan y paginan solo lo que cumple', async () => {
    const porVer = await pag.get('/api/library?status=POR_VER&limit=10');
    expect(porVer.body.total).toBe(15);
    expect(porVer.body.items).toHaveLength(10);
    expect(porVer.body.items.every((i: any) => i.state.status === 'POR_VER')).toBe(true);
    expect((await pag.get('/api/library?type=anime')).body.total).toBe(20);
    expect((await pag.get('/api/library?favorite=1')).body.total).toBe(6);
    const q = await pag.get('/api/library?q=' + encodeURIComponent('Título 5'));
    expect(q.body.total).toBe(10); // 05 y 50-59
    // los contadores no dependen del filtro
    expect(porVer.body.counts.todos).toBe(60);
  });

  it('cambiar una tarjeta ya cargada mientras se piden más lotes no duplica ni salta nada', async () => {
    const first = await pag.get('/api/library?limit=24');
    const seen = first.body.items.map((i: any) => i.id);
    // la persona cambia el estado de una tarjeta que ya ve (sube al principio del orden)
    await pag.put(`/api/library/${seen[10]}/status`, { status: 'DEJADO' });
    const rest: number[] = [];
    let cursor: string | null = first.body.nextCursor;
    while (cursor) {
      const r: any = await pag.get(`/api/library?limit=24&cursor=${encodeURIComponent(cursor)}`);
      rest.push(...r.body.items.map((i: any) => i.id));
      cursor = r.body.nextCursor;
    }
    expect(rest.filter((id) => seen.includes(id))).toEqual([]); // ni un duplicado
    expect(new Set([...seen, ...rest]).size).toBe(60);           // y no falta ninguno
  });

  it('valida el cursor y acota el tamaño del lote', async () => {
    expect((await pag.get('/api/library?cursor=basura')).status).toBe(400);
    expect((await pag.get('/api/library?limit=1000')).body.items.length).toBe(60); // máximo 60
    expect((await pag.get('/api/library?limit=abc')).body.items.length).toBe(24);   // por defecto
    expect((await pag.get('/api/library?limit=0')).body.items.length).toBe(24);
    expect((await pag.get('/api/library?status=NOPE')).status).toBe(400);
    expect((await new Client().get('/api/library')).status).toBe(401);
  });

  it('la lista de otro perfil también se pagina y respeta los permisos', async () => {
    // perfil privado de pag: otra persona sin amistad no la ve
    expect((await otra.get('/api/profiles/pag/library')).status).toBe(403);
    // el propio dueño sí la ve, paginada
    const own = await pag.get('/api/profiles/pag/library?limit=10');
    expect(own.status).toBe(200);
    expect(own.body.items).toHaveLength(10);
    expect(own.body.total).toBe(60);
    expect(own.body.counts.todos).toBe(60);
    const next = await pag.get(`/api/profiles/pag/library?limit=10&cursor=${encodeURIComponent(own.body.nextCursor)}`);
    expect(next.body.items).toHaveLength(10);
    expect(next.body.counts).toBeUndefined();
    expect(get<{ n: number }>('SELECT COUNT(*) AS n FROM user_content WHERE user_id = ?', [userId])!.n).toBe(60);
  });
});
