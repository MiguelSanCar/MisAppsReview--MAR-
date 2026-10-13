import { useEffect, useRef, useState } from 'react';
import type { Roadmap } from './types';

const POLL_MS = 4000;

// Lee /api/roadmap y lo refresca cada pocos segundos; solo actualiza el estado si cambió.
export function useRoadmap() {
  const [data, setData] = useState<Roadmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef('');

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch('/api/roadmap', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const raw = await res.text();
        if (stop) return;
        if (raw !== last.current) {
          last.current = raw;
          setData(JSON.parse(raw));
        }
        setError(null);
      } catch {
        if (!stop) setError('No se pudo cargar el roadmap. Reintentando…');
      }
    }
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { stop = true; clearInterval(timer); };
  }, []);

  return { data, error };
}
