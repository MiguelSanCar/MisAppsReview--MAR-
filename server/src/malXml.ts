import zlib from 'zlib';
import { mapMalStatus } from './domain/malImport';
import { HttpError } from './http';
import type { MalEntry } from './importTypes';

// Lector del fichero de exportación de MyAnimeList (myanimelist.net/panel.php?go=export): .xml o .xml.gz.
// Parser mínimo con expresiones regulares (sin dependencias ni DTD): solo lee los bloques <anime> y sus etiquetas.

export const MAL_EXPORT_MAX_ENTRIES = 10_000;
export const MAL_EXPORT_MAX_XML_BYTES = 20 * 1024 * 1024;

const TOO_BIG = 'El fichero es demasiado grande (máximo 20 MB descomprimido).';
const DAMAGED = 'El fichero está dañado o es demasiado grande (máximo 20 MB descomprimido).';
const NOT_MAL = 'No parece una exportación de MyAnimeList.';

/** Decodifica las entidades XML predefinidas y las numéricas. */
function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (all, ent: string) => {
    switch (ent) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
    }
    const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
    // Puntos de código no válidos se dejan tal cual.
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}

/** Texto de la primera etiqueta `<tag>` dentro de `block` (CDATA tal cual); null si no está. */
function tagText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag}\\s*>)`).exec(block);
  if (!m) return null;
  const raw = m[1] ?? '';
  // Puede mezclar CDATA y texto: los CDATA se copian tal cual y el resto se decodifica.
  let out = '';
  let last = 0;
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let c: RegExpExecArray | null;
  while ((c = cdata.exec(raw))) {
    out += decodeEntities(raw.slice(last, c.index)) + c[1];
    last = c.index + c[0].length;
  }
  out += decodeEntities(raw.slice(last));
  return out.trim();
}

/** Entero ≥ min de una etiqueta; null si no lo es. */
function intOf(text: string | null, min: number): number | null {
  if (text == null || !/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= min ? n : null;
}

function toText(buf: Buffer): string {
  let data = buf;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      data = zlib.gunzipSync(buf, { maxOutputLength: MAL_EXPORT_MAX_XML_BYTES });
    } catch {
      throw new HttpError(400, DAMAGED);
    }
  } else if (buf.length > MAL_EXPORT_MAX_XML_BYTES) {
    throw new HttpError(400, TOO_BIG);
  }
  let text = data.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

/**
 * Convierte el fichero (gzip detectado por los bytes 1f 8b) en entradas. Lanza HttpError(400) con un mensaje claro
 * si no es una exportación de anime de MAL, está dañado, supera el tamaño descomprimido o el máximo de entradas.
 * Las entradas del XML llevan `item: null` y `updatedAt: null`.
 */
export function parseMalExport(buf: Buffer): { malUser: string | null; entries: MalEntry[] } {
  const xml = toText(buf);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new HttpError(400, 'El fichero no puede incluir declaraciones DTD.');
  if (!/<myanimelist[\s>]/.test(xml)) throw new HttpError(400, NOT_MAL);

  const info = /<myinfo[\s>][\s\S]*?<\/myinfo\s*>/.exec(xml)?.[0] ?? '';
  const exportType = tagText(info, 'user_export_type');
  if (exportType === '2') throw new HttpError(400, 'Ese fichero es de manga: exporta tu lista de anime.');
  if (exportType != null && exportType !== '' && exportType !== '1') throw new HttpError(400, NOT_MAL);
  const malUser = tagText(info, 'user_name') || null;

  const entries: MalEntry[] = [];
  const blocks = /<anime[\s>]([\s\S]*?)<\/anime\s*>/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = blocks.exec(xml))) {
    if (++count > MAL_EXPORT_MAX_ENTRIES) {
      throw new HttpError(400, `La exportación tiene demasiadas entradas (máximo ${MAL_EXPORT_MAX_ENTRIES}).`);
    }
    const block = m[1];
    const malId = intOf(tagText(block, 'series_animedb_id'), 1);
    if (malId == null) continue;
    const status = mapMalStatus(tagText(block, 'my_status') ?? '');
    if (status == null) continue;
    const mediaType = (tagText(block, 'series_type') || 'unknown').toLowerCase().replace(/\s+/g, '_');
    let totalEpisodes = intOf(tagText(block, 'series_episodes'), 1);
    if (totalEpisodes == null && mediaType === 'movie') totalEpisodes = 1;
    const rewatching = tagText(block, 'my_rewatching') === '1';
    const watched = intOf(tagText(block, rewatching ? 'my_rewatching_ep' : 'my_watched_episodes'), 0) ?? 0;
    entries.push({
      malId,
      title: tagText(block, 'series_title') ?? '',
      mediaType,
      totalEpisodes,
      status,
      watched,
      rewatching,
      timesRewatched: intOf(tagText(block, 'my_times_watched'), 0) ?? 0,
      updatedAt: null,
      item: null,
    });
  }
  return { malUser, entries };
}
