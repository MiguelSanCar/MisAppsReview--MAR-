import path from 'path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { config, DEV_JWT_SECRET } from './config';
import { HttpError } from './http';
import { authRouter, loadUser } from './routes/auth';
import { accountRouter, publicRouter } from './routes/account';
import { friendsRouter } from './routes/friends';
import { profilesRouter } from './routes/profiles';
import { invitesRouter } from './routes/invites';
import { contentRouter, libraryRouter, searchRouter } from './routes/library';
import { listsRouter } from './routes/lists';
import { discoverRouter } from './routes/discover';
import { notificationsRouter } from './routes/notifications';
import { recoRouter } from './routes/recommendations';
import { roadmapRouter } from './roadmap';

export function createApp() {
  const app = express();
  // En producción hay un proxy delante (1 salto). En local solo se confía en proxies del propio equipo
  // (el túnel de cloudflared), para que req.secure / la IP real funcionen detrás de él.
  app.set('trust proxy', config.isProd ? 1 : 'loopback');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Pósters de TMDB / MyAnimeList y avatares (data:/blob: para el recorte)
          imgSrc: ["'self'", 'data:', 'blob:', 'https://image.tmdb.org', 'https://cdn.myanimelist.net'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: null, // si no, `npm start` por http://localhost no cargaría
        },
      },
    }),
  );
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '400kb' }));
  app.use(cookieParser());
  app.use(loadUser);

  // devSecret solo se informa fuera de producción: `npm run share` lo usa para no exponer un servidor con el secreto por defecto.
  app.get('/api/health', (_req, res) => res.json({ ok: true, ...(config.isProd ? {} : { devSecret: config.jwtSecret === DEV_JWT_SECRET }) }));
  app.use('/api/roadmap', roadmapRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api/me', accountRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/content', contentRouter);
  app.use('/api/library', libraryRouter);
  app.use('/api/recommendations', recoRouter);
  app.use('/api/discover', discoverRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/friends', friendsRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/lists', listsRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

  // En producción el servidor también sirve el cliente compilado.
  const clientDist = path.resolve(__dirname, '../../client/dist');
  // Caché: los ficheros con hash (/assets) son inmutables; el punto de entrada y el service worker se revalidan siempre
  // (si no, un móvil podría quedarse con un cliente o un sw.js antiguos).
  const NO_CACHE = new Set(['index.html', 'sw.js', 'offline.html', 'manifest.webmanifest']);
  app.use(
    express.static(clientDist, {
      setHeaders(res, file) {
        const rel = path.relative(clientDist, file).split(path.sep).join('/');
        if (rel.startsWith('assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (NO_CACHE.has(rel)) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    }),
  );
  app.get('*', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.extra ?? {}) });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}
