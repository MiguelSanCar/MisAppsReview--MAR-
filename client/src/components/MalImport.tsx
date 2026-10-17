import { useRef, useState } from 'react';
import { ApiError, api, errorText } from '../api';
import { useToast } from './Toast';

// Importar la lista de anime de MyAnimeList (Ajustes › Mi perfil).
// API: POST /api/import/mal/preview { username } y POST /api/import/mal/file (cuerpo en bruto) → ImportPreview;
//      POST /api/import/mal/confirm { token } → ImportResult (ver server/src/importTypes.ts).

interface ImportPreview {
  token: string;
  source: 'usuario' | 'fichero';
  malUser: string | null;
  total: number;
  summary: { add: number; update: number; same: number; adjusted: number; byType: Record<string, number> };
  sample: { title: string; outcome: 'add' | 'update' | 'same'; status: string; watched: number }[];
}

interface ImportResult { added: number; updated: number; same: number; adjusted: number }

type Busy = false | 'consulta' | 'confirma';

/** Sube el fichero de exportación en bruto (api.ts solo envía JSON). Errores con el mismo formato que api.ts. */
async function uploadFile(file: File): Promise<ImportPreview> {
  let res: Response;
  try {
    res = await fetch('/api/import/mal/file', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': file.name.toLowerCase().endsWith('.gz') ? 'application/gzip' : 'application/xml' },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* sin cuerpo JSON */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Error ${res.status}`, data);
  return data as ImportPreview;
}

export function MalImport() {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState<Busy>(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPreview(null); setUsername(''); setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 410) {
      toast('La vista previa ha caducado, vuelve a importar', 'error');
      reset();
      return;
    }
    toast(errorText(e), 'error');
    setBusy(false);
  }

  async function load(get: () => Promise<ImportPreview>) {
    setBusy('consulta');
    try {
      setPreview(await get());
      setBusy(false);
    } catch (e) { fail(e); }
  }

  function byName() {
    const name = username.trim();
    if (!name || busy) return;
    load(() => api.post<ImportPreview>('/api/import/mal/preview', { username: name }));
  }

  function byFile(file: File | undefined) {
    if (!file || busy) return;
    load(() => uploadFile(file)).finally(() => { if (fileRef.current) fileRef.current.value = ''; });
  }

  async function confirm() {
    if (!preview || busy) return;
    setBusy('confirma');
    try {
      const r = await api.post<ImportResult>('/api/import/mal/confirm', { token: preview.token });
      toast(`Importados ${r.added + r.updated} anime (${r.updated} actualizados)`, 'ok');
      reset();
    } catch (e) { fail(e); }
  }

  const s = preview?.summary;
  const upToDate = !!s && s.add + s.update === 0;

  return (
    <div className="mal-import">
      <h3 className="h3">Importar de MyAnimeList</h3>
      <p className="muted">Trae tu lista de anime de MyAnimeList a Mi lista. Si algo ya está, se queda lo más avanzado.</p>

      {!preview && (
        <>
          <form className="share-url mal-row" onSubmit={(e) => { e.preventDefault(); byName(); }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tu usuario de MyAnimeList"
              aria-label="Tu usuario de MyAnimeList"
              autoComplete="off"
              spellCheck={false}
              disabled={!!busy}
            />
            <button type="submit" className="btn primary" disabled={!!busy || !username.trim()}>Importar</button>
          </form>
          <button type="button" className="mal-link small" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            ¿Lista privada? Sube el fichero de exportación
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xml,.gz,.xml.gz"
            hidden
            aria-label="Fichero de exportación de MyAnimeList"
            onChange={(e) => byFile(e.target.files?.[0])}
          />
          <p className="muted small">
            Descárgalo en{' '}
            <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener noreferrer">myanimelist.net › Export</a>
            {' '}(«Export My Anime List») y súbelo tal cual, comprimido o no.
          </p>
        </>
      )}

      {busy === 'consulta' && <p className="muted small" role="status">Consultando MyAnimeList…</p>}

      {preview && s && (
        <div className="mal-preview" aria-live="polite">
          <p>
            <b>{preview.total} anime</b> de {preview.malUser ?? 'tu fichero'}:{' '}
            {upToDate
              ? 'Ya está todo al día'
              : <>se añadirán {s.add} · se actualizarán {s.update} · sin cambios {s.same}
                  {s.adjusted > 0 && <> · {s.adjusted} solo como «Por ver» (sin estrenar)</>}</>}
          </p>
          {!upToDate && preview.sample.length > 0 && (
            <p className="muted small">Por ejemplo: {preview.sample.slice(0, 3).map((x) => x.title).join(' · ')}</p>
          )}
          <div className="mal-actions">
            {upToDate ? (
              <button type="button" className="btn" onClick={reset}>Cerrar</button>
            ) : (
              <>
                <button type="button" className="btn primary" onClick={confirm} disabled={!!busy}>
                  {busy === 'confirma' ? 'Importando…' : 'Confirmar importación'}
                </button>
                <button type="button" className="btn" onClick={reset} disabled={!!busy}>Cancelar</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
