import { Router } from 'express';
import { ah, HttpError } from '../http';
import { recommend } from '../recommendations';
import { getState } from '../library';
import { requireAuth, uid } from './auth';

export const recoRouter = Router();

/** Recomendaciones según tus géneros más afines (series o películas). */
recoRouter.get(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const type = String(req.query.type ?? 'serie');
    if (type !== 'serie' && type !== 'pelicula' && type !== 'anime') throw new HttpError(400, 'Tipo no válido');
    const out = await recommend(uid(req), type);
    const states: Record<number, ReturnType<typeof getState>> = {};
    for (const i of out.items) states[i.id] = getState(uid(req), i.id);
    res.json({ ...out, states });
  }),
);
