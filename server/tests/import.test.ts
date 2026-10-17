import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { all, get } from '../src/db';
import { drainImportFill, resetImportState } from '../src/malImport';
import { Client, startTestApp } from './client';

let app: Awaited<ReturnType<typeof startTestApp>>;

const register = async (name: string) => {
  const c = new Client();
  await c.post('/api/auth/register', { username: name, email: `${name}@test.com`, password: 'secreto123' });
  return c;
};

const malRow = (malId: number) => get<any>("SELECT * FROM content WHERE source = 'mal' AND external_id = ?", [String(malId)]);
const stateOf = (c: Client, userId: number, malId: number) =>
  get<any>('SELECT uc.* FROM user_content uc JOIN content c ON c.id = uc.content_id WHERE uc.user_id = ? AND c.external_id = ? AND c.source = ?', [userId, String(malId), 'mal']);
const userId = async (c: Client) => (await c.get('/api/auth/me')).body.user.id as number;

const preview = (c: Client, username = 'lector') => c.post('/api/import/mal/preview', { username });
const confirm = (c: Client, token: string) => c.post('/api/import/mal/confirm', { token });

/** Exportación de MAL mínima: Naruto (id 20, con ficha en el simulador) y un anime sin ficha (777). */
const EXPORT_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo><user_id>1</user_id><user_name>Fichero</user_name><user_export_type>1</user_export_type></myinfo>
  <anime>
    <series_animedb_id>20</series_animedb_id>
    <series_title><![CDATA[Naruto]]></series_title>
    <series_type>TV</series_type>
    <series_episodes>220</series_episodes>
    <my_watched_episodes>50</my_watched_episodes>
    <my_status>Watching</my_status>
    <my_times_watched>0</my_times_watched>
    <my_rewatching>0</my_rewatching>
  </anime>
  <anime>
    <series_animedb_id>777</series_animedb_id>
    <series_title><![CDATA[Anime perdido]]></series_title>
    <series_type>OVA</series_type>
    <series_episodes>2</series_episodes>
    <my_watched_episodes>2</my_watched_episodes>
    <my_status>Completed</my_status>
    <my_times_watched>0</my_times_watched>
    <my_rewatching>0</my_rewatching>
  </anime>
</myanimelist>`;

beforeAll(async () => {
  app = await startTestApp();
  config.importRateLimit = 10_000;
});
beforeEach(() => resetImportState());
afterAll(async () => {
  await drainImportFill();
  resetImportState();
  await app.stop();
});

describe('importación desde MyAnimeList: acceso', () => {
  it('sin sesión → 401', async () => {
    const anon = new Client();
    expect((await preview(anon)).status).toBe(401);
    expect((await anon.raw('/api/import/mal/file', Buffer.from(EXPORT_XML), 'application/xml')).status).toBe(401);
    expect((await confirm(anon, 'a'.repeat(32))).status).toBe(401);
  });

  it('errores de MAL y validación del nombre', async () => {
    const c = await register('errores');
    expect((await preview(c, 'privado')).status).toBe(403);
    expect((await preview(c, 'nadie')).status).toBe(404);
    expect((await preview(c, '   ')).status).toBe(400);
    expect((await preview(c, 'x'.repeat(33))).status).toBe(400);
    expect((await c.post('/api/import/mal/preview', {})).status).toBe(400);
    expect((await confirm(c, 'no-es-un-token')).status).toBe(400);
  });
});

describe('importación desde un fichero de exportación', () => {
  it('vista previa, confirmación y fichas completadas en segundo plano', async () => {
    const c = await register('fabi');
    const id = await userId(c);
    expect(malRow(20)).toBeUndefined(); // nadie ha buscado Naruto todavía: la fila nace del XML, sin póster

    const p = await c.raw('/api/import/mal/file', Buffer.from(EXPORT_XML), 'application/xml');
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ source: 'fichero', malUser: 'Fichero', total: 2, summary: { add: 2, update: 0, same: 0 } });
    expect(p.body.summary.byType).toEqual({ tv: 1, ova: 1 });
    expect(p.body.token).toMatch(/^[0-9a-f]{32}$/);
    expect(malRow(20)).toBeUndefined(); // la vista previa no escribe nada

    const r = await confirm(c, p.body.token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ added: 2, updated: 0, same: 0, adjusted: 0 });
    expect(stateOf(c, id, 20)).toMatchObject({ status: 'VIENDO', watched_episodes: 50 });
    expect(stateOf(c, id, 777)).toMatchObject({ status: 'FINALIZADO', watched_episodes: 2 });
    // Sin fecha en el XML: el orden del fichero (la primera entrada, la más reciente) y siempre ISO con Z
    const a = stateOf(c, id, 20).updated_at as string;
    const b = stateOf(c, id, 777).updated_at as string;
    expect(a).toMatch(/Z$/);
    expect(a > b).toBe(true);

    await drainImportFill();
    expect(malRow(20).poster_url).toBeTruthy();   // completada con la ficha de MAL
    expect(malRow(20).detailed_at).toBeTruthy();
    expect(malRow(777)).toMatchObject({ title: 'Anime perdido', poster_url: null }); // sin ficha: se omite sin fallar
  });

  it('rechaza lo que no es un fichero y lo demasiado grande', async () => {
    const c = await register('subidas');
    expect((await c.raw('/api/import/mal/file', Buffer.from(EXPORT_XML), 'text/plain')).status).toBe(415);
    expect((await c.raw('/api/import/mal/file', Buffer.alloc(0), 'application/xml')).status).toBe(415);
    expect((await c.raw('/api/import/mal/file', Buffer.alloc(2 * 1024 * 1024 + 10, 32), 'application/octet-stream')).status).toBe(413);
    expect((await c.raw('/api/import/mal/file', Buffer.from('no es xml'), 'application/xml')).status).toBe(400);
    const empty = '<?xml version="1.0"?><myanimelist><myinfo><user_name>x</user_name><user_export_type>1</user_export_type></myinfo></myanimelist>';
    const r = await c.raw('/api/import/mal/file', Buffer.from(empty), 'text/xml');
    expect(r.status).toBe(400);
  });
});

describe('importación por nombre de usuario', () => {
  let ana: Client;
  let anaId: number;

  beforeAll(async () => {
    ana = await register('ana');
    anaId = await userId(ana);
  });

  it('vista previa y confirmación de la lista de «lector»', async () => {
    const joint = get<{ n: number }>('SELECT COUNT(*) AS n FROM joint_list_items')!.n;
    const p = await preview(ana);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ source: 'usuario', malUser: 'lector', total: 6, summary: { add: 6, update: 0, same: 0, adjusted: 0 } });
    expect(p.body.summary.byType).toEqual({ tv: 3, movie: 1, ova: 2 });
    expect(p.body.sample).toHaveLength(3);
    expect(p.body.sample[0]).toMatchObject({ title: 'Naruto', outcome: 'add', status: 'VIENDO', watched: 100 });

    const r = await confirm(ana, p.body.token);
    expect(r.body).toEqual({ added: 6, updated: 0, same: 0, adjusted: 0 });
    expect(stateOf(ana, anaId, 5114)).toMatchObject({ status: 'FINALIZADO', watched_episodes: 1, prev_episodes: 2, rewatch: 2, is_favorite: 0 });
    expect(stateOf(ana, anaId, 20)).toMatchObject({ status: 'VIENDO', watched_episodes: 100, prev_episodes: 0, rewatch: 0 });
    expect(stateOf(ana, anaId, 20).updated_at).toBe('2026-09-01T10:00:00.000Z'); // fecha de MAL
    const dates = all<{ updated_at: string }>('SELECT updated_at FROM user_content WHERE user_id = ?', [anaId]);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(d.updated_at))).toBe(true);

    const lib = (await ana.get('/api/library?type=anime')).body;
    expect(lib.items).toHaveLength(6);
    expect(lib.items[0].title).toBe('Naruto'); // la más reciente en MAL va primero
    // 100 (Naruto) + 1 + 2 anteriores (película) + 5 + 3 + 0 + 2
    expect((await ana.get('/api/me/profile')).body.stats.episodes).toBe(113);
    expect(get<{ n: number }>('SELECT COUNT(*) AS n FROM joint_list_items')!.n).toBe(joint); // listas conjuntas intactas
  });

  it('repetir la importación no cambia nada', async () => {
    const p = await preview(ana);
    expect(p.body.summary).toMatchObject({ add: 0, update: 0, same: 6 });
    expect(p.body.sample).toEqual([]);
    expect((await confirm(ana, p.body.token)).body).toEqual({ added: 0, updated: 0, same: 6, adjusted: 0 });
  });

  it('se queda lo más avanzado y conserva el favorito', async () => {
    const eva = await register('eva');
    const evaId = await userId(eva);
    const naruto = malRow(20).id;
    const peli = malRow(5114).id;
    await eva.put(`/api/library/${naruto}/status`, { status: 'FINALIZADO' }); // más avanzado que en MAL
    await eva.put(`/api/library/${peli}/favorite`, { value: true });          // menos: MAL tiene 2 revisionados

    const p = await preview(eva);
    expect(p.body.summary).toMatchObject({ add: 4, update: 1, same: 1 });
    expect((await confirm(eva, p.body.token)).body).toEqual({ added: 4, updated: 1, same: 1, adjusted: 0 });
    expect(stateOf(eva, evaId, 20)).toMatchObject({ status: 'FINALIZADO', watched_episodes: 220 }); // no se degrada
    expect(stateOf(eva, evaId, 5114).updated_at).toMatch(/Z$/);
    expect(stateOf(eva, evaId, 5114)).toMatchObject({ status: 'FINALIZADO', prev_episodes: 2, rewatch: 2, is_favorite: 1 });
    expect(stateOf(eva, evaId, 9002)).toMatchObject({ status: 'DEJADO', watched_episodes: 3 }); // alta
    expect(stateOf(eva, evaId, 9002).updated_at).toMatch(/Z$/);
  });
});

describe('token de confirmación', () => {
  it('es de un solo uso, personal y lo sustituye una vista previa nueva', async () => {
    const leo = await register('leo');
    const mia = await register('mia');
    const first = (await preview(leo)).body.token;
    const second = (await preview(leo)).body.token;
    expect(second).not.toBe(first);
    expect((await confirm(leo, first)).status).toBe(404);  // sustituido
    expect((await confirm(mia, second)).status).toBe(404); // de otra persona
    expect((await confirm(leo, second)).status).toBe(200);
    const again = await confirm(leo, second);
    expect(again.status).toBe(410);                        // ya usado
    expect(again.body.error).toMatch(/caducado/);
  });

  it('caduca a los 10 minutos', async () => {
    const tom = await register('tom');
    const token = (await preview(tom)).body.token;
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60_000 + 1000);
    try {
      expect((await confirm(tom, token)).status).toBe(410);
    } finally {
      spy.mockRestore();
    }
    expect(get('SELECT 1 FROM user_content uc JOIN users u ON u.id = uc.user_id WHERE u.username = ?', ['tom'])).toBeUndefined();
  });
});

describe('límite de importaciones', () => {
  it('la tercera petición seguida da 429 con IMPORT_RATE_LIMIT=2', async () => {
    const c = await register('prisas');
    const other = await register('calma');
    config.importRateLimit = 2;
    try {
      expect((await preview(c)).status).toBe(200);
      expect((await preview(c)).status).toBe(200);
      const r = await preview(c);
      expect(r.status).toBe(429);
      expect(r.body.error).toMatch(/Demasiadas importaciones/);
      expect((await preview(other)).status).toBe(200); // el límite es por persona
    } finally {
      config.importRateLimit = 10_000;
    }
  });
});
