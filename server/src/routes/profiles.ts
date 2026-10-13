import { Request, Router } from 'express';
import { HttpError } from '../http';
import { buildProfile } from '../profile';
import { listLibrary } from '../library';
import { CONTENT_TYPES, STATUSES } from '../domain/rules';
import { getUser, getUserByName, publicUser, UserRow } from '../users';
import { requireAuth } from './auth';
import { between, friendsOf } from './friends';

/**
 * Perfiles con URL propia: /perfil/<usuario>.
 *  - self / friend: acceso completo (perfil, lista y amigos).
 *  - public: cualquiera (incluso sin cuenta) ve el perfil; la lista solo si la persona lo permite.
 *  - private: solo se ve que existe; se ofrece enviar una solicitud.
 */
export const profilesRouter = Router();

type Access = 'self' | 'friend' | 'public' | 'private';
type Relation = 'anonymous' | 'none' | 'pending_out' | 'pending_in';

function resolve(req: Request, username: string): { target: UserRow; access: Access; relation: Relation } {
  const target = getUserByName(username);
  if (!target) throw Object.assign(new HttpError(404, 'Este perfil no existe'), { code: 'not_found' });
  const me = req.user;
  let access: Access;
  let relation: Relation = me ? 'none' : 'anonymous';
  if (me && me.id === target.id) access = 'self';
  else {
    const f = me ? between(me.id, target.id) : undefined;
    if (f?.status === 'accepted') access = 'friend';
    else {
      if (f) relation = f.requester_id === me!.id ? 'pending_out' : 'pending_in';
      access = target.profile_public ? 'public' : 'private';
    }
  }
  return { target, access, relation };
}

const canSeeList = (access: Access, target: UserRow) => access === 'self' || access === 'friend' || (access === 'public' && !!target.share_list);
const canSeeFriends = (access: Access) => access === 'self' || access === 'friend';

function deny(message: string, code: string, extra: object = {}): never {
  throw Object.assign(new HttpError(403, message), { code, extra });
}

/** Equivalencia id → nombre de usuario (para redirigir las direcciones antiguas /friend/<número>). */
profilesRouter.get('/by-id/:id(\\d+)', requireAuth, (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u) throw new HttpError(404, 'Este perfil no existe');
  res.json({ username: u.username });
});

profilesRouter.get('/:username', (req, res) => {
  const { target, access, relation } = resolve(req, req.params.username);
  if (access === 'private') {
    const u = publicUser(target);
    return res.status(403).json({
      error: 'Este perfil es privado',
      code: 'private',
      user: { username: u.username, avatarUrl: u.avatarUrl },
      relation,
    });
  }
  res.json({
    ...buildProfile(target.id),
    access,
    relation,
    isPublic: !!target.profile_public,
    canSeeList: canSeeList(access, target),
    canSeeFriends: canSeeFriends(access),
  });
});

profilesRouter.get('/:username/library', (req, res) => {
  const { target, access } = resolve(req, req.params.username);
  if (!canSeeList(access, target)) deny('La lista de esta persona no es visible', 'list_hidden');
  const status = req.query.status ? String(req.query.status) : undefined;
  const type = req.query.type ? String(req.query.type) : undefined;
  if (status && !STATUSES.includes(status as any)) throw new HttpError(400, 'Estado no válido');
  if (type && !CONTENT_TYPES.includes(type as any)) throw new HttpError(400, 'Tipo no válido');
  res.json({ user: publicUser(target), items: listLibrary(target.id, { status: status as any, type }) });
});

profilesRouter.get('/:username/friends', (req, res) => {
  const { target, access } = resolve(req, req.params.username);
  if (!canSeeFriends(access)) deny('Solo los amigos pueden ver los amigos de esta persona', 'friends_only');
  res.json({ user: publicUser(target), friends: friendsOf(target.id) });
});
