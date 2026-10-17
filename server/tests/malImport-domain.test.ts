import { describe, expect, it } from 'vitest';
import { gateRelease, mapMalStatus, mergeMostAdvanced, rankKey, toFullState } from '../src/domain/malImport';
import type { FullState, MalEntry, MalStatus } from '../src/importTypes';

// Reglas puras de la importación desde MyAnimeList (sin app ni BD).

const entry = (status: MalStatus, watched: number, extra: Partial<MalEntry> = {}): MalEntry => ({
  malId: 1,
  title: 'Prueba',
  mediaType: 'tv',
  totalEpisodes: 12,
  status,
  watched,
  rewatching: false,
  timesRewatched: 0,
  updatedAt: null,
  item: null,
  ...extra,
});

const st = (status: FullState['status'], watched: number, prev = 0, rewatch = 0): FullState => ({ status, watched, prev, rewatch });

describe('mapMalStatus', () => {
  it('acepta el formato de la API', () => {
    expect(mapMalStatus('watching')).toBe('watching');
    expect(mapMalStatus('completed')).toBe('completed');
    expect(mapMalStatus('on_hold')).toBe('on_hold');
    expect(mapMalStatus('dropped')).toBe('dropped');
    expect(mapMalStatus('plan_to_watch')).toBe('plan_to_watch');
  });

  it('acepta el formato del XML', () => {
    expect(mapMalStatus('Watching')).toBe('watching');
    expect(mapMalStatus('Completed')).toBe('completed');
    expect(mapMalStatus('On-Hold')).toBe('on_hold');
    expect(mapMalStatus('Dropped')).toBe('dropped');
    expect(mapMalStatus('Plan to Watch')).toBe('plan_to_watch');
    expect(mapMalStatus('  plan to watch ')).toBe('plan_to_watch');
  });

  it('devuelve null si no lo reconoce', () => {
    expect(mapMalStatus('rewatching')).toBeNull();
    expect(mapMalStatus('')).toBeNull();
  });
});

describe('toFullState', () => {
  it('mapea los 5 estados', () => {
    expect(toFullState(entry('watching', 3), 12)).toEqual(st('VIENDO', 3));
    expect(toFullState(entry('on_hold', 3), 12)).toEqual(st('VIENDO', 3));
    expect(toFullState(entry('completed', 12), 12)).toEqual(st('FINALIZADO', 12));
    expect(toFullState(entry('dropped', 4), 12)).toEqual(st('DEJADO', 4));
    expect(toFullState(entry('plan_to_watch', 0), 12)).toEqual(st('POR_VER', 0));
  });

  it('topa los episodios al total y finaliza al llegar', () => {
    expect(toFullState(entry('watching', 30), 12)).toEqual(st('FINALIZADO', 12));
    expect(toFullState(entry('dropped', 12), 12)).toEqual(st('FINALIZADO', 12));
  });

  it('completed marca todos los episodios aunque MAL diga menos', () => {
    expect(toFullState(entry('completed', 5), 12)).toEqual(st('FINALIZADO', 12));
  });

  it('completed con revisionados acumula los visionados anteriores', () => {
    expect(toFullState(entry('completed', 12, { timesRewatched: 2 }), 12)).toEqual(st('FINALIZADO', 12, 24, 2));
  });

  it('rewatching en curso cuenta el visionado como uno más', () => {
    expect(toFullState(entry('completed', 3, { rewatching: true, timesRewatched: 1 }), 12)).toEqual(st('VIENDO', 3, 24, 2));
    expect(toFullState(entry('watching', 0, { rewatching: true }), 12)).toEqual(st('POR_VER', 0, 12, 1));
  });

  it('rewatching con todos los episodios queda finalizado', () => {
    expect(toFullState(entry('watching', 12, { rewatching: true, timesRewatched: 1 }), 12)).toEqual(st('FINALIZADO', 12, 24, 2));
  });

  it('sin total conocido usa lo visto', () => {
    expect(toFullState(entry('completed', 0, { totalEpisodes: null }), null)).toEqual(st('FINALIZADO', 0));
    expect(toFullState(entry('watching', 5, { totalEpisodes: null }), null)).toEqual(st('VIENDO', 5));
    expect(toFullState(entry('watching', 5), 0)).toEqual(st('VIENDO', 5));
    expect(toFullState(entry('completed', 10, { timesRewatched: 1 }), null)).toEqual(st('FINALIZADO', 10, 10, 1));
  });

  it('plan_to_watch con episodios pasa a VIENDO', () => {
    expect(toFullState(entry('plan_to_watch', 2), 12)).toEqual(st('VIENDO', 2));
  });

  it('normaliza valores raros a enteros no negativos', () => {
    expect(toFullState(entry('watching', -3, { timesRewatched: -1 }), 12)).toEqual(st('VIENDO', 0));
    expect(toFullState(entry('watching', 2.7), 12)).toEqual(st('VIENDO', 2));
  });
});

describe('rankKey', () => {
  it('cuenta las veces terminado, los episodios y el estado', () => {
    expect(rankKey(st('FINALIZADO', 12, 24, 2))).toEqual([3, 36, 3]);
    expect(rankKey(st('VIENDO', 3, 24, 2))).toEqual([2, 27, 2]);
    expect(rankKey(st('POR_VER', 0))).toEqual([0, 0, 0]);
  });
});

describe('mergeMostAdvanced', () => {
  it('añade si no estaba', () => {
    const incoming = st('VIENDO', 3);
    expect(mergeMostAdvanced(null, incoming)).toEqual({ next: incoming, outcome: 'add' });
  });

  it('un FINALIZADO de MAR no se degrada a VIENDO aunque traiga más episodios', () => {
    const current = st('FINALIZADO', 12);
    const res = mergeMostAdvanced(current, st('VIENDO', 20));
    expect(res).toEqual({ next: current, outcome: 'same' });
  });

  it('gana quien tiene más revisionados', () => {
    // Un revisionado en curso iguala las veces terminado y suma más episodios.
    const res = mergeMostAdvanced(st('FINALIZADO', 12), st('VIENDO', 3, 12, 1));
    expect(res).toEqual({ next: st('VIENDO', 3, 12, 1), outcome: 'update' });
    expect(mergeMostAdvanced(st('FINALIZADO', 12, 12, 1), st('FINALIZADO', 12)).outcome).toBe('same');
    const res2 = mergeMostAdvanced(st('FINALIZADO', 12), st('FINALIZADO', 12, 12, 1));
    expect(res2).toEqual({ next: st('FINALIZADO', 12, 12, 1), outcome: 'update' });
  });

  it('más episodios gana con las mismas veces terminado', () => {
    expect(mergeMostAdvanced(st('VIENDO', 3), st('DEJADO', 5))).toEqual({ next: st('DEJADO', 5), outcome: 'update' });
  });

  it('empate → se queda lo de MAR', () => {
    const current = st('VIENDO', 5);
    expect(mergeMostAdvanced(current, st('VIENDO', 5))).toEqual({ next: current, outcome: 'same' });
  });

  it('copia la tupla completa del ganador sin mezclar campos', () => {
    const current = st('VIENDO', 8, 0, 0);
    const incoming = st('FINALIZADO', 4, 0, 0);
    expect(mergeMostAdvanced(current, incoming).next).toEqual(incoming);
  });
});

describe('gateRelease', () => {
  it('no estrenado → POR_VER con 0', () => {
    expect(gateRelease(st('FINALIZADO', 12, 12, 1), { unreleased: true, watchable: null })).toEqual({
      state: st('POR_VER', 0),
      adjusted: true,
    });
    expect(gateRelease(st('VIENDO', 2), { unreleased: false, watchable: 0 })).toEqual({ state: st('POR_VER', 0), adjusted: true });
  });

  it('ya en POR_VER sin episodios no se ajusta', () => {
    expect(gateRelease(st('POR_VER', 0), { unreleased: true, watchable: null })).toEqual({ state: st('POR_VER', 0), adjusted: false });
  });

  it('topa los episodios a los disponibles', () => {
    expect(gateRelease(st('FINALIZADO', 12), { unreleased: false, watchable: 5 })).toEqual({ state: st('VIENDO', 5), adjusted: true });
    expect(gateRelease(st('VIENDO', 3), { unreleased: false, watchable: 5 })).toEqual({ state: st('VIENDO', 3), adjusted: false });
    expect(gateRelease(st('VIENDO', 3), { unreleased: false, watchable: null })).toEqual({ state: st('VIENDO', 3), adjusted: false });
  });
});
