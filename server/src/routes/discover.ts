import { Router } from 'express';
import { z } from 'zod';
import { toDto, upsertFromProvider } from '../content';
import { ah, HttpError, parse } from '../http';
import { getState } from '../library';
import { discoverFiltered, genreNamesTmdb, providersTmdb, searchCompaniesTmdb, tmdbAvailable, TmdbKind } from '../providers/tmdb';
import { requireAuth, uid } from './auth';

/** Búsqueda avanzada con filtros (solo series y películas: MyAnimeList no ofrece estos filtros). */
export const discoverRouter = Router();
discoverRouter.use(requireAuth);

const KIND: Record<string, TmdbKind> = { serie: 'tv', pelicula: 'movie' };
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const nowYear = new Date().getFullYear();

const filterSchema = z.object({
  type: z.enum(['serie', 'pelicula'], { errorMap: () => ({ message: 'Tipo no válido: usa serie o pelicula' }) }).default('serie'),
  sort: z.enum(['popularity', 'rating', 'date'], { errorMap: () => ({ message: 'Orden no válido' }) }).default('popularity'),
  page: int(1, 500).default(1),
  genre: int(1, 1_000_000).optional(),
  platform: int(1, 1_000_000).optional(),
  studio: int(1, 10_000_000).optional(),
  yearFrom: int(1900, nowYear + 2).optional(),
  yearTo: int(1900, nowYear + 2).optional(),
  minRating: z.coerce.number().min(1, 'La puntuación mínima va de 1 a 9').max(9, 'La puntuación mínima va de 1 a 9').optional(),
}).refine((v) => !v.yearFrom || !v.yearTo || v.yearFrom <= v.yearTo, { message: 'El año inicial no puede ser mayor que el final' });

const needTmdb = () => { if (!tmdbAvailable()) throw new HttpError(503, 'Falta TMDB_API_KEY: la búsqueda avanzada no está disponible.'); };
const kindOf = (v: unknown): TmdbKind => {
  const t = String(v ?? 'serie');
  if (!KIND[t]) throw new HttpError(400, 'Tipo no válido: usa serie o pelicula');
  return KIND[t];
};

discoverRouter.get(
  '/',
  ah(async (req, res) => {
    needTmdb();
    const f = parse(filterSchema, req.query);
    const t0 = Date.now();
    const page = await discoverFiltered({ kind: KIND[f.type], page: f.page, sort: f.sort, genre: f.genre, platform: f.platform, studio: f.studio, yearFrom: f.yearFrom, yearTo: f.yearTo, minRating: f.minRating });
    const results = page.items.map((i) => toDto(upsertFromProvider(i)));
    const states: Record<number, ReturnType<typeof getState>> = {};
    for (const r of results) states[r.id] = getState(uid(req), r.id);
    res.json({ results, states, page: page.page, totalPages: page.totalPages, hasMore: page.page < page.totalPages, tookMs: Date.now() - t0 });
  }),
);

/** Plataformas de streaming de la región. */
discoverRouter.get('/providers', ah(async (req, res) => {
  needTmdb();
  res.json({ providers: await providersTmdb(kindOf(req.query.type)) });
}));

/** Géneros de TMDB para series o películas, ordenados por nombre. */
discoverRouter.get('/genres', ah(async (req, res) => {
  needTmdb();
  const names = await genreNamesTmdb(kindOf(req.query.type));
  res.json({ genres: Object.entries(names).map(([id, name]) => ({ id: Number(id), name })).sort((a, b) => a.name.localeCompare(b.name, 'es')) });
}));

/** Sugerencias de estudio/productora por nombre. */
discoverRouter.get('/studios', ah(async (req, res) => {
  needTmdb();
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) throw new HttpError(400, 'Escribe al menos 2 caracteres');
  if (q.length > 60) throw new HttpError(400, 'Texto demasiado largo');
  res.json({ studios: await searchCompaniesTmdb(q) });
}));
