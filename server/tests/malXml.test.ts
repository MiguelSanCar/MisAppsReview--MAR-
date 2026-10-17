import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http';
import { MAL_EXPORT_MAX_ENTRIES, parseMalExport } from '../src/malXml';

// Lector de la exportación XML de MyAnimeList (fase 29).

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'mal-export.xml'));

/** Comprueba que lanza HttpError(400) y devuelve su mensaje. */
function error400(buf: Buffer): string {
  try {
    parseMalExport(buf);
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(400);
    return (e as HttpError).message;
  }
  throw new Error('no ha lanzado');
}

function wrap(body: string, exportType = '1'): string {
  return `<?xml version="1.0" encoding="UTF-8" ?>\n<myanimelist><myinfo><user_name>yo</user_name>`
    + `<user_export_type>${exportType}</user_export_type></myinfo>${body}</myanimelist>`;
}

function anime(id: number): string {
  return `<anime><series_animedb_id>${id}</series_animedb_id><series_title><![CDATA[A${id}]]></series_title>`
    + '<series_type>TV</series_type><series_episodes>12</series_episodes><my_watched_episodes>0</my_watched_episodes>'
    + '<my_status>Plan to Watch</my_status></anime>';
}

function checkFixture(res: ReturnType<typeof parseMalExport>) {
  expect(res.malUser).toBe('Xinil');
  // Se ignoran la del estado raro y la de id 0.
  expect(res.entries.map((e) => e.malId)).toEqual([48, 21, 199, 1735, 30, 6702, 40028]);
  const by = (id: number) => res.entries.find((e) => e.malId === id)!;

  expect(by(48)).toEqual({
    malId: 48, title: '.hack//Sign & <Roots>', mediaType: 'tv', totalEpisodes: 26, status: 'completed',
    watched: 26, rewatching: false, timesRewatched: 1, updatedAt: null, item: null,
  });
  // Entidades fuera de CDATA; en emisión (0 episodios) → null.
  expect(by(21).title).toBe('One Piece & Friends éñ "OP" \'x\' <1>');
  expect(by(21).totalEpisodes).toBeNull();
  expect(by(21).watched).toBe(1000);
  expect(by(21).status).toBe('watching');
  // Película sin episodios → 1.
  expect(by(199)).toMatchObject({ mediaType: 'movie', totalEpisodes: 1, status: 'plan_to_watch', watched: 0 });
  expect(by(1735)).toMatchObject({ status: 'on_hold', watched: 120, totalEpisodes: 500 });
  // Revisionando: los vistos son los del revisionado actual.
  expect(by(30)).toMatchObject({ status: 'completed', rewatching: true, watched: 5, timesRewatched: 2 });
  expect(by(6702)).toMatchObject({ status: 'dropped', watched: 12 });
  expect(by(40028)).toMatchObject({ mediaType: 'tv_special', totalEpisodes: 2, watched: 1 });
}

describe('parseMalExport', () => {
  it('lee un XML plano con todos los estados, CDATA y entidades', () => {
    checkFixture(parseMalExport(fixture));
  });

  it('lee el mismo contenido comprimido en gzip', () => {
    checkFixture(parseMalExport(zlib.gzipSync(fixture)));
  });

  it('acepta el BOM de UTF-8', () => {
    checkFixture(parseMalExport(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture])));
  });

  it('acepta un fichero sin user_export_type ni user_name', () => {
    const xml = `<myanimelist><myinfo></myinfo>${anime(5)}</myanimelist>`;
    const res = parseMalExport(Buffer.from(xml));
    expect(res.malUser).toBeNull();
    expect(res.entries).toHaveLength(1);
  });

  it('rechaza una exportación de manga', () => {
    expect(error400(Buffer.from(wrap('', '2')))).toMatch(/manga/);
  });

  it('rechaza un gzip dañado', () => {
    const gz = zlib.gzipSync(fixture);
    const broken = Buffer.concat([gz.subarray(0, 20), Buffer.alloc(40, 0xff)]);
    expect(error400(broken)).toMatch(/dañado/);
  });

  it('rechaza una bomba gzip que supera el tamaño descomprimido', () => {
    const bomb = zlib.gzipSync(Buffer.alloc(25 * 1024 * 1024, 0x20));
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(error400(bomb)).toMatch(/demasiado grande/);
  });

  it('rechaza un XML plano que supera el tamaño', () => {
    expect(error400(Buffer.alloc(20 * 1024 * 1024 + 1, 0x20))).toMatch(/demasiado grande/);
  });

  it('rechaza DOCTYPE y ENTITY', () => {
    const doctype = '<?xml version="1.0"?><!DOCTYPE myanimelist [<!ENTITY a "aaaa">]>' + wrap(anime(1)).replace(/^<\?xml[^>]*>/, '');
    expect(error400(Buffer.from(doctype))).toMatch(/DTD/);
    expect(error400(Buffer.from(wrap('<!ENTITY x "y">' + anime(1))))).toMatch(/DTD/);
  });

  it('rechaza lo que no es una exportación de MAL', () => {
    expect(error400(Buffer.from('<?xml version="1.0"?><rss><channel></channel></rss>'))).toMatch(/MyAnimeList/);
    expect(error400(Buffer.from('hola, esto no es XML'))).toMatch(/MyAnimeList/);
    expect(error400(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))).toMatch(/MyAnimeList/);
  });

  it(`rechaza más de ${MAL_EXPORT_MAX_ENTRIES} entradas y acepta justo el máximo`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => anime(i + 1)).join('');
    expect(parseMalExport(Buffer.from(wrap(many(MAL_EXPORT_MAX_ENTRIES)))).entries).toHaveLength(MAL_EXPORT_MAX_ENTRIES);
    expect(error400(Buffer.from(wrap(many(MAL_EXPORT_MAX_ENTRIES + 1))))).toMatch(/demasiadas entradas/);
  });
});
