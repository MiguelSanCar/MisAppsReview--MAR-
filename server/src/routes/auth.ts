import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { get, run } from '../db';
import { ah, HttpError, parse } from '../http';
import { getUser, selfDto, UserRow } from '../users';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

const COOKIE = 'mar_token';
const WEEK = 7 * 86400_000;

function setSession(req: Request, res: Response, userId: number) {
  const token = jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: WEEK });
}

/** Carga el usuario si hay sesión válida (no falla si no hay). */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, config.jwtSecret) as { uid: number };
      req.user = getUser(uid);
    } catch {
      /* sesión caducada o manipulada: se ignora */
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Necesitas iniciar sesión'));
  next();
}

/** Id del usuario autenticado (solo tras requireAuth). */
export const uid = (req: Request) => req.user!.id;

export const limiter = rateLimit({
  windowMs: 15 * 60_000,
  max: () => config.authRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

const passwordRule = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100, 'Contraseña demasiado larga');
const registerSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_.-]{3,20}$/, 'El usuario debe tener 3-20 caracteres (letras, números, _ . -)'),
  email: z.string().trim().email('Correo no válido').max(120, 'Correo demasiado largo'),
  password: passwordRule,
  /** Tema que la persona ya estaba usando en el navegador (opcional; por defecto oscuro). */
  theme: z.enum(['dark', 'light']).optional(),
});
const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Indica tu usuario o correo'),
  password: z.string().min(1, 'Indica tu contraseña'),
});

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('no-existe', 10);

/** Envío de correos: sin SMTP configurado el enlace se escribe en la consola del servidor. */
function deliverLink(email: string, subject: string, path: string) {
  const link = `${config.publicUrl || config.clientOrigin}${path}`;
  console.log(`\n[correo simulado] Para: ${email}\n  Asunto: ${subject}\n  Enlace: ${link}\n`);
  return link;
}

function createToken(userId: number, kind: 'reset' | 'verify', ttlMs: number) {
  const token = crypto.randomBytes(32).toString('hex');
  run('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?', [userId, kind]);
  run('INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)', [sha(token), userId, kind, Date.now() + ttlMs]);
  return token;
}

function consumeToken(token: string, kind: 'reset' | 'verify'): number {
  const row = get<{ user_id: number; expires_at: number }>('SELECT user_id, expires_at FROM auth_tokens WHERE token_hash = ? AND kind = ?', [sha(token), kind]);
  if (!row || row.expires_at < Date.now()) throw new HttpError(400, 'El enlace no es válido o ha caducado');
  run('DELETE FROM auth_tokens WHERE token_hash = ?', [sha(token)]);
  return row.user_id;
}

export const authRouter = Router();

authRouter.post(
  '/register',
  limiter,
  ah(async (req, res) => {
    const { username, email, password, theme } = parse(registerSchema, req.body);
    if (get('SELECT 1 FROM users WHERE username = ?', [username])) throw new HttpError(409, 'Ese nombre de usuario ya está en uso');
    if (get('SELECT 1 FROM users WHERE email = ?', [email])) throw new HttpError(409, 'Ese correo ya está registrado');
    const hash = await bcrypt.hash(password, 10);
    const { lastId } = run('INSERT INTO users (username, email, password_hash, theme, created_at) VALUES (?, ?, ?, ?, ?)', [username, email, hash, theme ?? 'dark', new Date().toISOString()]);
    setSession(req, res, lastId);
    res.status(201).json({ user: selfDto(getUser(lastId)!) });
  }),
);

authRouter.post(
  '/login',
  limiter,
  ah(async (req, res) => {
    const { identifier, password } = parse(loginSchema, req.body);
    const user = get<UserRow>('SELECT * FROM users WHERE username = ? OR email = ?', [identifier, identifier]);
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Usuario o contraseña incorrectos');
    setSession(req, res, user.id);
    res.json({ user: selfDto(user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? selfDto(req.user) : null });
});

// --- Recuperar contraseña (8.1) ---
authRouter.post(
  '/forgot',
  limiter,
  ah(async (req, res) => {
    const { email } = parse(z.object({ email: z.string().trim().email('Correo no válido') }), req.body);
    const user = get<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
    let devLink: string | undefined;
    if (user) {
      const token = createToken(user.id, 'reset', 3600_000);
      devLink = deliverLink(user.email, 'Recuperar contraseña de MAR', `/reset/${token}`);
    }
    // Siempre la misma respuesta para no revelar qué correos existen. El enlace solo se devuelve en local.
    res.json({ ok: true, ...(config.isProd ? {} : { devLink }) });
  }),
);

authRouter.post(
  '/reset',
  limiter,
  ah(async (req, res) => {
    const { token, password } = parse(z.object({ token: z.string().min(10), password: passwordRule }), req.body);
    const userId = consumeToken(token, 'reset');
    run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), userId]);
    res.json({ ok: true });
  }),
);

// --- Verificar correo (8.2) ---
authRouter.post(
  '/verify/send',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user!;
    if (u.email_verified) return res.json({ ok: true, alreadyVerified: true });
    const token = createToken(u.id, 'verify', 24 * 3600_000);
    const devLink = deliverLink(u.email, 'Verifica tu correo en MAR', `/verify/${token}`);
    res.json({ ok: true, ...(config.isProd ? {} : { devLink }) });
  }),
);

authRouter.post(
  '/verify',
  ah(async (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(10) }), req.body);
    const userId = consumeToken(token, 'verify');
    run('UPDATE users SET email_verified = 1 WHERE id = ?', [userId]);
    res.json({ ok: true });
  }),
);
