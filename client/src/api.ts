export class ApiError extends Error {
  /** `data`: cuerpo JSON del error (p. ej. { code: 'private', user, relation }). */
  constructor(public status: number, message: string, public data?: any) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e; // petición cancelada a propósito (búsqueda al escribir)
    throw new ApiError(0, 'No hay conexión con el servidor');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* sin cuerpo JSON */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Error ${res.status}`, data);
  return data as T;
}

export const api = {
  get: <T>(p: string, signal?: AbortSignal) => request<T>('GET', p, undefined, signal),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  put: <T>(p: string, b: unknown = {}) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};

export const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';
export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal');
