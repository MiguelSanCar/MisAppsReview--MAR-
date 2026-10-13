import crypto from 'crypto';
import fs from 'fs';
import { Request, Router } from 'express';
import { z } from 'zod';
import { config } from './config';
import { HttpError, parse } from './http';

export const roadmapRouter = Router();

// Lectura pública y solo lectura del roadmap.
roadmapRouter.get('/', (_req, res) => {
  fs.readFile(config.roadmapFile, 'utf8', (err, raw) => {
    if (err) return res.status(500).json({ error: 'No se pudo leer el roadmap' });
    try {
      res.set('Cache-Control', 'no-store').json(JSON.parse(raw));
    } catch {
      // El fichero puede estar a medio escribir; el cliente reintentará en el siguiente ciclo.
      res.status(503).json({ error: 'Roadmap no válido temporalmente' });
    }
  });
});

// --- Buzón de ideas (8.3): solo se puede usar desde esta misma máquina y fuera de producción ---
interface Idea { id: string; text: string; createdAt: string }

function isLocal(req: Request) {
  const ip = req.socket.remoteAddress || '';
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
  return local && !config.isProd && !req.headers['x-forwarded-for'];
}

function readIdeas(): Idea[] {
  try {
    return JSON.parse(fs.readFileSync(config.ideasFile, 'utf8'));
  } catch {
    return [];
  }
}

function writeIdeas(ideas: Idea[]) {
  const tmp = `${config.ideasFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ideas, null, 2) + '\n');
  fs.renameSync(tmp, config.ideasFile);
}

function localOnly(req: Request) {
  if (!isLocal(req)) throw new HttpError(403, 'El buzón de ideas solo está disponible en local');
}

roadmapRouter.get('/ideas', (req, res) => {
  if (!isLocal(req)) return res.json({ canWrite: false, ideas: [] });
  res.json({ canWrite: true, ideas: readIdeas() });
});

roadmapRouter.post('/ideas', (req, res) => {
  localOnly(req);
  const { text } = parse(z.object({ text: z.string().trim().min(1, 'Escribe tu idea').max(280, 'Máximo 280 caracteres') }), req.body);
  const ideas = readIdeas();
  if (ideas.length >= 200) throw new HttpError(400, 'Demasiadas ideas guardadas; borra alguna');
  ideas.unshift({ id: crypto.randomBytes(4).toString('hex'), text, createdAt: new Date().toISOString() });
  writeIdeas(ideas);
  res.status(201).json({ ideas });
});

roadmapRouter.delete('/ideas/:id', (req, res) => {
  localOnly(req);
  const ideas = readIdeas().filter((i) => i.id !== req.params.id);
  writeIdeas(ideas);
  res.json({ ideas });
});
