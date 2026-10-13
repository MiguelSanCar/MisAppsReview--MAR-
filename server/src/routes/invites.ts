import crypto from 'crypto';
import { Router } from 'express';
import { get, run } from '../db';
import { HttpError } from '../http';
import { getUser, publicUser } from '../users';
import { limiter, requireAuth, uid } from './auth';
import { areFriends, between } from './friends';

export const invitesRouter = Router();

type Kind = 'befriend' | 'request';
interface Invite { token: string; creator_id: number; kind: Kind; target_id: number; created_at: string }

const TOKEN = /^[a-f0-9]{32}$/;

/** Mismo enlace cada vez que la misma persona lo pide (hasta que lo renueve). */
function getOrCreate(creatorId: number, kind: Kind, targetId: number): string {
  const ex = get<Invite>('SELECT * FROM invite_links WHERE creator_id = ? AND kind = ? AND target_id = ?', [creatorId, kind, targetId]);
  if (ex) return ex.token;
  const token = crypto.randomBytes(16).toString('hex');
  run('INSERT INTO invite_links (token, creator_id, kind, target_id, created_at) VALUES (?, ?, ?, ?, ?)', [token, creatorId, kind, targetId, new Date().toISOString()]);
  return token;
}

function findInvite(token: string): Invite {
  const inv = TOKEN.test(token) ? get<Invite>('SELECT * FROM invite_links WHERE token = ?', [token]) : undefined;
  if (!inv) throw new HttpError(404, 'Este enlace no existe o ya no es válido');
  return inv;
}

// --- Generar enlaces (hay que estar identificado: el enlace queda ligado a quien lo genera) ---

/** Enlace propio: quien lo abra pasa a ser amigo de la persona que lo generó. */
invitesRouter.post('/mine', requireAuth, (req, res) => {
  res.json({ token: getOrCreate(uid(req), 'befriend', 0), kind: 'befriend' });
});

/** Enlace desde el perfil de un amigo: quien lo abra envía una solicitud a ESA persona (no se añade directamente). */
invitesRouter.post('/request/:userId', requireAuth, (req, res) => {
  const me = uid(req);
  const target = getUser(Number(req.params.userId));
  if (!target) throw new HttpError(404, 'Usuario no encontrado');
  // Se puede compartir el perfil de un amigo o de cualquier perfil público (el privado solo lo ven sus amigos).
  if (target.id !== me && !areFriends(me, target.id) && !target.profile_public) {
    throw new HttpError(403, 'Solo puedes compartir el perfil de tus amigos o de perfiles públicos');
  }
  // En el perfil propio se comparte el enlace de amistad normal
  if (target.id === me) return res.json({ token: getOrCreate(me, 'befriend', 0), kind: 'befriend' });
  res.json({ token: getOrCreate(me, 'request', target.id), kind: 'request' });
});

/** Renovar el enlace de amistad propio: el anterior deja de funcionar. */
invitesRouter.post('/revoke', requireAuth, (req, res) => {
  run("DELETE FROM invite_links WHERE creator_id = ? AND kind = 'befriend'", [uid(req)]);
  res.json({ token: getOrCreate(uid(req), 'befriend', 0), kind: 'befriend' });
});

// --- Abrir un enlace ---

/** Vista previa pública: quién lo generó y para quién es (sirve para la pantalla de "inicia sesión"). */
invitesRouter.get('/:token', limiter, (req, res) => {
  const inv = findInvite(req.params.token);
  const creator = getUser(inv.creator_id);
  const target = inv.kind === 'request' ? getUser(inv.target_id) : undefined;
  if (!creator || (inv.kind === 'request' && !target)) throw new HttpError(404, 'Este enlace no existe o ya no es válido');
  const mini = (u: NonNullable<typeof creator>) => ({ username: u.username, avatarUrl: publicUser(u).avatarUrl });
  res.json({ kind: inv.kind, creator: mini(creator), target: target ? mini(target) : null });
});

invitesRouter.post('/:token/accept', requireAuth, (req, res) => {
  const inv = findInvite(req.params.token);
  const me = uid(req);

  if (inv.kind === 'befriend') {
    const creator = getUser(inv.creator_id)!;
    if (creator.id === me) throw new HttpError(400, 'Este es tu propio enlace de amistad: compártelo con otra persona.');
    const ex = between(me, creator.id);
    if (ex?.status === 'accepted') return res.json({ result: 'already', user: publicUser(creator) });
    if (ex) run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [ex.id]);
    else run("INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'accepted', ?)", [me, creator.id, new Date().toISOString()]);
    return res.json({ result: 'friends', user: publicUser(creator) });
  }

  const target = getUser(inv.target_id);
  if (!target) throw new HttpError(404, 'Este enlace no existe o ya no es válido');
  if (target.id === me) throw new HttpError(400, 'Este enlace sirve para que otras personas te envíen una solicitud a ti.');
  const ex = between(me, target.id);
  if (ex?.status === 'accepted') return res.json({ result: 'already', user: publicUser(target) });
  if (ex) {
    // La otra persona ya te había enviado una solicitud: se acepta.
    if (ex.addressee_id === me) {
      run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [ex.id]);
      return res.json({ result: 'friends', user: publicUser(target) });
    }
    return res.json({ result: 'pending', user: publicUser(target) }); // ya habías enviado una
  }
  run('INSERT INTO friendships (requester_id, addressee_id, created_at) VALUES (?, ?, ?)', [me, target.id, new Date().toISOString()]);
  res.status(201).json({ result: 'requested', user: publicUser(target) });
});
