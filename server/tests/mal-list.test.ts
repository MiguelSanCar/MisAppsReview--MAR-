import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { HttpError } from '../src/http';
import { fetchUserAnimeList, searchMal } from '../src/providers/mal';
import { startTestApp } from './client';

// Lectura de la lista pública de un usuario desde la API oficial de MyAnimeList (importación, fase 29).

let env: Awaited<ReturnType<typeof startTestApp>>;
const listCalls = () => env.mock.calls.filter((c) => c.includes('/users/'));

beforeAll(async () => {
  env = await startTestApp();
});
afterAll(async () => {
  await env.stop();
});

/** Ejecuta y devuelve el HttpError con el que se rechaza. */
async function failure(p: Promise<unknown>): Promise<HttpError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    return e as HttpError;
  }
  throw new Error('debía fallar');
}

describe('lista pública de un usuario de MyAnimeList', () => {
  it('trae la lista completa, incluido el contenido nsfw', async () => {
    const list = await fetchUserAnimeList('lector');
    expect(list).toHaveLength(6);
    expect(list.map((e) => e.malId)).toEqual([20, 5114, 9001, 9002, 9003, 9004]);
    expect(list.map((e) => e.status)).toEqual(['watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch', 'completed']);
  });

  it('normaliza cada entrada', async () => {
    const list = await fetchUserAnimeList('lector');
    const naruto = list.find((e) => e.malId === 20)!;
    expect(naruto).toMatchObject({
      title: 'Naruto', mediaType: 'tv', totalEpisodes: 220, status: 'watching', watched: 100,
      rewatching: false, timesRewatched: 0, updatedAt: '2026-09-01T10:00:00.000Z',
    });
    expect(naruto.updatedAt).toMatch(/Z$/);
    expect(naruto.item).toMatchObject({ source: 'mal', externalId: '20', type: 'anime', posterUrl: 'https://cdn.myanimelist.net/xl.jpg' });

    const movie = list.find((e) => e.malId === 5114)!;
    expect(movie).toMatchObject({ mediaType: 'movie', status: 'completed', totalEpisodes: 1, timesRewatched: 2, watched: 1 });

    const airing = list.find((e) => e.malId === 9001)!;
    expect(airing).toMatchObject({ status: 'on_hold', totalEpisodes: null, watched: 5 });
    expect(list.find((e) => e.malId === 9002)!.mediaType).toBe('ova');
  });

  it('pagina con su propio offset y nunca sigue paging.next', async () => {
    const before = env.mock.calls.length;
    const list = await fetchUserAnimeList('lector', 2);
    expect(list).toHaveLength(6);
    const calls = env.mock.calls.slice(before);
    expect(calls).toEqual(['/mal/users/lector/animelist', '/mal/users/lector/animelist', '/mal/users/lector/animelist']);
    expect(env.mock.calls.some((c) => c.includes('evil') || c.includes('/next'))).toBe(false);
  });

  it('usuario inexistente → 404', async () => {
    const e = await failure(fetchUserAnimeList('nadie'));
    expect(e.status).toBe(404);
    expect(e.message).toBe('No existe ese usuario en MyAnimeList');
  });

  it('lista privada → 403 con instrucciones', async () => {
    const e = await failure(fetchUserAnimeList('privado'));
    expect(e.status).toBe(403);
    expect(e.message).toMatch(/privada/);
  });

  it('un nombre no válido se rechaza sin tocar la red', async () => {
    const before = listCalls().length;
    for (const bad of ['../anime/1', 'a', 'con espacios', 'demasiado_largo_para_mal']) {
      const e = await failure(fetchUserAnimeList(bad));
      expect(e.status).toBe(400);
      expect(e.message).toBe('Nombre de usuario de MyAnimeList no válido');
    }
    expect(listCalls().length).toBe(before);
    expect(env.mock.calls.some((c) => c.includes('/anime/1'))).toBe(false);
  });

  it('sin Client ID → 503', async () => {
    const id = config.malClientId;
    config.malClientId = '';
    try {
      const e = await failure(fetchUserAnimeList('lector'));
      expect(e.status).toBe(503);
    } finally {
      config.malClientId = id;
    }
  });

  it('las búsquedas de anime siguen funcionando con los campos de siempre', async () => {
    const r = await searchMal('naruto list');
    expect(r.map((x) => x.title)).toContain('Naruto');
  });
});
