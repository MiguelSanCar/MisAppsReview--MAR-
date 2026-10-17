import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { ah, HttpError, parse } from '../http';
import { confirmImport, previewImport } from '../malImport';
import { parseMalExport } from '../malXml';
import { fetchUserAnimeList } from '../providers/mal';
import { requireAuth, uid } from './auth';

// Importación desde MyAnimeList (/api/import).
//   POST /mal/preview  { username }                       → ImportPreview
//   POST /mal/file     cuerpo en bruto (.xml / .xml.gz)    → ImportPreview   (application/octet-stream|gzip|xml, 2 MB)
//   POST /mal/confirm  { token }                          → ImportResult
// Con sesión y límite propio de 10 peticiones cada 15 minutos por persona (IMPORT_RATE_LIMIT).

export const importRouter = Router();

const importLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: () => config.importRateLimit,
  keyGenerator: (req) => String(uid(req)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas importaciones seguidas: espera unos minutos' },
});

importRouter.use(requireAuth, importLimiter);

const previewSchema = z.object({
  username: z.string({ required_error: 'Indica tu usuario de MyAnimeList' }).trim()
    .min(1, 'Indica tu usuario de MyAnimeList').max(32, 'Usuario de MyAnimeList no válido'),
});
const confirmSchema = z.object({ token: z.string().regex(/^[0-9a-f]{32}$/, 'Token no válido') });

const rawExport = express.raw({
  type: ['application/octet-stream', 'application/gzip', 'application/x-gzip', 'application/xml', 'text/xml'],
  limit: '2mb',
});

importRouter.post(
  '/mal/preview',
  ah(async (req, res) => {
    const { username } = parse(previewSchema, req.body);
    const entries = await fetchUserAnimeList(username);
    res.json(previewImport(uid(req), 'usuario', username, entries));
  }),
);

importRouter.post(
  '/mal/file',
  rawExport,
  ah(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      throw new HttpError(415, 'Sube el fichero de exportación de MyAnimeList (.xml o .xml.gz)');
    }
    const { malUser, entries } = parseMalExport(req.body);
    res.json(previewImport(uid(req), 'fichero', malUser, entries));
  }),
);

importRouter.post(
  '/mal/confirm',
  ah(async (req, res) => {
    const { token } = parse(confirmSchema, req.body);
    res.json(confirmImport(uid(req), token));
  }),
);
