import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db';
import { ah, HttpError, parse } from '../http';
import { buildProfile } from '../profile';
import { listLibrary } from '../library';
import { getUser, selfDto, UserRow } from '../users';
import { requireAuth, uid } from './auth';

export const accountRouter = Router();
export const publicRouter = Router();

// --- Avatar (imagen ya recortada en el cliente; se valida el tipo real por su cabecera) ---
function detectImage(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length > 12 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

publicRouter.get('/avatar/:id', (req, res) => {
  const u = get<Pick<UserRow, 'avatar'>>('SELECT avatar FROM users WHERE id = ?', [Number(req.params.id)]);
  if (!u?.avatar) return res.status(404).end();
  const buf = Buffer.from(u.avatar.split(',')[1] ?? '', 'base64');
  const type = detectImage(buf);
  if (!type) return res.status(404).end();
  res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' }).send(buf);
});

accountRouter.use(requireAuth);

accountRouter.put('/avatar', (req, res) => {
  const { dataUrl } = parse(z.object({ dataUrl: z.string().max(400_000, 'La imagen es demasiado grande') }), req.body);
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Formato de imagen no válido (PNG, JPG o WebP)');
  if (!detectImage(Buffer.from(m[2], 'base64'))) throw new HttpError(400, 'El fichero no es una imagen válida');
  run('UPDATE users SET avatar = ?, avatar_v = avatar_v + 1 WHERE id = ?', [dataUrl, uid(req)]);
  res.json({ user: selfDto(getUser(uid(req))!) });
});

accountRouter.delete('/avatar', (req, res) => {
  run('UPDATE users SET avatar = NULL, avatar_v = avatar_v + 1 WHERE id = ?', [uid(req)]);
  res.json({ user: selfDto(getUser(uid(req))!) });
});

// --- Perfil propio ---
accountRouter.get('/profile', (req, res) => res.json(buildProfile(uid(req))));

// --- Visibilidad del perfil: solo amigos (por defecto) o público ---
accountRouter.put('/visibility', (req, res) => {
  const { isPublic, showList } = parse(z.object({ isPublic: z.boolean(), showList: z.boolean() }), req.body);
  run('UPDATE users SET profile_public = ?, share_list = ? WHERE id = ?', [isPublic, showList, uid(req)]);
  res.json({ user: selfDto(getUser(uid(req))!) });
});

// --- Tema de la interfaz (claro / oscuro): se guarda por usuario ---
accountRouter.put('/theme', (req, res) => {
  const { theme } = parse(z.object({ theme: z.enum(['dark', 'light'], { errorMap: () => ({ message: 'Tema no válido' }) }) }), req.body);
  run('UPDATE users SET theme = ? WHERE id = ?', [theme, uid(req)]);
  res.json({ user: selfDto(getUser(uid(req))!) });
});

// --- Ajustes de las notificaciones ---
accountRouter.put('/notifications', (req, res) => {
  const body = parse(z.object({ favoritesOnly: z.boolean().optional(), introSeen: z.boolean().optional() }), req.body);
  if (body.favoritesOnly !== undefined) run('UPDATE users SET notif_favorites_only = ? WHERE id = ?', [body.favoritesOnly, uid(req)]);
  if (body.introSeen !== undefined) run('UPDATE users SET notif_intro_seen = ? WHERE id = ?', [body.introSeen, uid(req)]);
  res.json({ user: selfDto(getUser(uid(req))!) });
});

// --- Exportar todos los datos (copia de seguridad personal) ---
accountRouter.get('/export', (req, res) => {
  const u = getUser(uid(req))!;
  const items = listLibrary(u.id).map((i) => ({
    titulo: i.title, tipo: i.type, fuente: i.source, idExterno: i.externalId, anyo: i.year,
    estado: i.state.status, episodiosVistos: i.state.watched, episodiosTotales: i.totalEpisodes,
    favorito: i.state.favorite, actualizado: i.state.updatedAt,
  }));
  res
    .set('Content-Disposition', `attachment; filename="mar-${u.username}.json"`)
    .json({ exportadoEl: new Date().toISOString(), usuario: { nombre: u.username, correo: u.email, creado: u.created_at }, contenidos: items });
});

// --- Enlaces antiguos /u/<token>: solo sirven para saber a qué perfil (/perfil/<usuario>) redirigir ---
publicRouter.get('/public/:token', (req, res) => {
  const token = String(req.params.token);
  const u = /^[a-f0-9]{32}$/.test(token)
    ? get<UserRow>('SELECT * FROM users WHERE share_token = ? AND profile_public = 1', [token])
    : undefined;
  if (!u) throw new HttpError(404, 'Este perfil no existe o no está compartido');
  res.json({ username: u.username });
});
