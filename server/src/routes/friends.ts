import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db';
import { HttpError, parse } from '../http';
import { getUser, publicUser, UserRow } from '../users';
import { requireAuth, uid } from './auth';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

export interface Friendship { id: number; requester_id: number; addressee_id: number; status: 'pending' | 'accepted' }

export const between = (a: number, b: number) =>
  get<Friendship>(
    'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)',
    [a, b, b, a],
  );

export const areFriends = (a: number, b: number) => between(a, b)?.status === 'accepted';

export const friendsOf = (userId: number) =>
  all<UserRow>(
    `SELECT u.* FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
     WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
     ORDER BY u.username COLLATE NOCASE`,
    [userId, userId, userId],
  ).map(publicUser);

friendsRouter.get('/', (req, res) => {
  const me = uid(req);
  const pending = all<Friendship & { other: number }>(
    `SELECT f.*, CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END AS other
     FROM friendships f WHERE f.status = 'pending' AND (f.requester_id = ? OR f.addressee_id = ?) ORDER BY f.id DESC`,
    [me, me, me],
  );
  const shape = (p: Friendship & { other: number }) => ({ id: p.id, user: publicUser(getUser(p.other)!) });
  res.json({
    friends: friendsOf(me),
    incoming: pending.filter((p) => p.addressee_id === me).map(shape),
    outgoing: pending.filter((p) => p.requester_id === me).map(shape),
  });
});

friendsRouter.post('/requests', (req, res) => {
  const { username } = parse(z.object({ username: z.string().trim().min(1, 'Indica un nombre de usuario') }), req.body);
  const me = uid(req);
  const other = get<UserRow>('SELECT * FROM users WHERE username = ?', [username]);
  if (!other) throw new HttpError(404, 'No existe ningún usuario con ese nombre');
  if (other.id === me) throw new HttpError(400, 'No puedes añadirte a ti mismo');
  const existing = between(me, other.id);
  if (existing?.status === 'accepted') throw new HttpError(409, 'Ya sois amigos');
  if (existing) {
    if (existing.addressee_id === me) {
      // La otra persona ya te había enviado solicitud: se acepta directamente.
      run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [existing.id]);
      return res.json({ accepted: true, user: publicUser(other) });
    }
    throw new HttpError(409, 'Ya has enviado una solicitud a esta persona');
  }
  run('INSERT INTO friendships (requester_id, addressee_id, created_at) VALUES (?, ?, ?)', [me, other.id, new Date().toISOString()]);
  res.status(201).json({ accepted: false, user: publicUser(other) });
});

friendsRouter.post('/requests/:id/accept', (req, res) => {
  const f = get<Friendship>('SELECT * FROM friendships WHERE id = ?', [Number(req.params.id)]);
  if (!f || f.addressee_id !== uid(req) || f.status !== 'pending') throw new HttpError(404, 'Solicitud no encontrada');
  run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [f.id]);
  res.json({ ok: true });
});

// Rechazar, cancelar solicitud enviada o eliminar amistad (por id de la relación).
friendsRouter.delete('/requests/:id', (req, res) => {
  const f = get<Friendship>('SELECT * FROM friendships WHERE id = ?', [Number(req.params.id)]);
  const me = uid(req);
  if (!f || (f.requester_id !== me && f.addressee_id !== me)) throw new HttpError(404, 'Solicitud no encontrada');
  run('DELETE FROM friendships WHERE id = ?', [f.id]);
  res.json({ ok: true });
});

friendsRouter.delete('/:userId', (req, res) => {
  const f = between(uid(req), Number(req.params.userId));
  if (!f || f.status !== 'accepted') throw new HttpError(404, 'No sois amigos');
  run('DELETE FROM friendships WHERE id = ?', [f.id]);
  res.json({ ok: true });
});
