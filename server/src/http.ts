import http from 'http';
import https from 'https';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { config } from './config';

export class HttpError extends Error {
  /** Código estable para el cliente (p. ej. "private"). */
  code?: string;
  /** Datos adicionales que se envían en el cuerpo del error. */
  extra?: object;
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** GET JSON con timeout (Node 16 no trae fetch). */
export function getJson<T = any>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs: number },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { Accept: 'application/json', ...opts.headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!res.statusCode || res.statusCode >= 400) {
          return reject(new HttpError(res.statusCode || 502, `El proveedor respondió ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new HttpError(502, 'Respuesta no válida del proveedor'));
        }
      });
    });
    req.setTimeout(opts.timeoutMs, () => req.destroy(new HttpError(504, 'El proveedor tardó demasiado en responder')));
    req.on('error', (e) => reject(e instanceof HttpError ? e : new HttpError(502, 'No se pudo conectar con el proveedor')));
  });
}

const breaker = new Map<string, { until: number; fails: number }>();

/**
 * Corte automático de un proveedor que no responde (red caída, bloqueo, timeout, 5xx): durante `baseMs` no se
 * reintenta, para que una API caída no ralentice cada búsqueda. Si al volver a probar sigue caído, la espera
 * se duplica (hasta `providerDownMaxMs`); en cuanto responde, se reinicia. Los errores de la API (401, 404…)
 * no lo activan.
 */
export async function guarded<T>(key: string, baseMs: number, fn: () => Promise<T>): Promise<T> {
  const st = breaker.get(key);
  if (st && st.until > Date.now()) throw new HttpError(503, 'Proveedor no disponible temporalmente');
  try {
    const r = await fn();
    breaker.delete(key); // ha respondido: se reinicia el retroceso
    return r;
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 0;
    if (status === 0 || status >= 502) {
      const fails = (breaker.get(key)?.fails ?? 0) + 1;
      const wait = Math.min(baseMs * 2 ** (fails - 1), Math.max(baseMs, config.providerDownMaxMs));
      breaker.set(key, { until: Date.now() + wait, fails });
    }
    throw e;
  }
}

/** Envuelve handlers async para que los errores lleguen al middleware de errores. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Valida con zod y lanza 400 con el primer mensaje. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message || 'Datos no válidos');
  return r.data;
}
