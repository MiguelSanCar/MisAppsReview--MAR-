import { FormEvent, useEffect, useState } from 'react';
import { api, errorText } from '../api';

interface Idea { id: string; text: string; createdAt: string }

/** Buzón de ideas: solo aparece cuando la API se usa desde el propio equipo (no en producción). */
export default function IdeasBox() {
  const [state, setState] = useState<{ canWrite: boolean; ideas: Idea[] } | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ canWrite: boolean; ideas: Idea[] }>('/api/roadmap/ideas').then(setState).catch(() => setState(null));
  }, []);

  if (!state?.canWrite) return null;

  async function add(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post<{ ideas: Idea[] }>('/api/roadmap/ideas', { text });
      setState({ canWrite: true, ideas: r.ideas }); setText('');
    } catch (err) { setError(errorText(err)); }
  }
  async function remove(id: string) {
    const r = await api.del<{ ideas: Idea[] }>(`/api/roadmap/ideas/${id}`);
    setState({ canWrite: true, ideas: r.ideas });
  }

  return (
    <details className="ideas" open={state.ideas.length > 0}>
      <summary>Buzón de ideas <span>(solo visible en local · {state.ideas.length})</span></summary>
      <form onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Apunta una idea para más adelante…" maxLength={280} aria-label="Nueva idea" />
        <button>Guardar</button>
      </form>
      {error && <p className="rm-error">{error}</p>}
      <ul>
        {state.ideas.map((i) => (
          <li key={i.id}>
            <span>{i.text}</span>
            <button onClick={() => remove(i.id)} aria-label="Borrar idea">✕</button>
          </li>
        ))}
      </ul>
    </details>
  );
}
