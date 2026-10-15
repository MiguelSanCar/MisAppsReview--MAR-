import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/domain/time';
import {
  applyEpisodes, applyFavorite, applyStatus, DEFAULT_EPISODE_MINUTES, episodeMinutes, minutesWatched,
} from '../src/domain/rules';
import { config } from '../src/config';

const H = 60;
const D = 24 * H;

describe('formatDuration (horas → días → semanas → meses → años)', () => {
  it.each([
    [0, '0 horas'],
    [90, '1,5 horas'],
    [60, '1 hora'],
    [23 * H, '23 horas'],
    [24 * H, '1 día'],
    [3.5 * D, '3,5 días'],
    [6.9 * D, '6,9 días'],
    [7 * D, '1 semana'],
    [10 * D, '1,4 semanas'],
    [27 * D, '3,9 semanas'],
    [28 * D, '1 mes'],
    [60 * D, '2 meses'],
    [364 * D, '12 meses'],
    [400 * D, '1,1 años'],
    [365.25 * 2 * D, '2 años'],
  ])('%d min → %s', (min, text) => {
    expect(formatDuration(min).text).toBe(text);
  });

  it('valores inválidos o negativos dan 0', () => {
    expect(formatDuration(-5).text).toBe('0 horas');
    expect(formatDuration(NaN).text).toBe('0 horas');
  });

  it('devuelve unidad y valor numérico', () => {
    expect(formatDuration(2 * D)).toMatchObject({ value: 2, unit: 'días' });
  });
});

describe('reglas de episodios y estados', () => {
  const por = { status: 'POR_VER', watched: 0 } as const;

  it('superar el total fija el máximo y finaliza', () => {
    expect(applyEpisodes(por, 12, 99)).toEqual({ status: 'FINALIZADO', watched: 12 });
  });
  it('alcanzar el total finaliza', () => {
    expect(applyEpisodes({ status: 'VIENDO', watched: 11 }, 12, 12)).toEqual({ status: 'FINALIZADO', watched: 12 });
  });
  it('primer episodio pasa de Por ver a Viendo', () => {
    expect(applyEpisodes(por, 12, 1)).toEqual({ status: 'VIENDO', watched: 1 });
  });
  it('quitar episodios a un finalizado lo devuelve a Viendo', () => {
    expect(applyEpisodes({ status: 'FINALIZADO', watched: 12 }, 12, 11)).toEqual({ status: 'VIENDO', watched: 11 });
  });
  it('volver a 0 episodios deja Por ver; Dejado se respeta', () => {
    expect(applyEpisodes({ status: 'VIENDO', watched: 1 }, 12, 0)).toEqual({ status: 'POR_VER', watched: 0 });
    expect(applyEpisodes({ status: 'DEJADO', watched: 3 }, 12, 4)).toEqual({ status: 'DEJADO', watched: 4 });
  });
  it('solo enteros no negativos', () => {
    expect(applyEpisodes(por, 12, -3).watched).toBe(0);
    expect(applyEpisodes(por, 12, 2.9).watched).toBe(2);
    expect(applyEpisodes(por, 12, NaN).watched).toBe(0);
  });
  it('total desconocido: sin tope', () => {
    expect(applyEpisodes(por, null, 500)).toEqual({ status: 'VIENDO', watched: 500 });
  });
  it('película (1 episodio): ver 1 la finaliza', () => {
    expect(applyEpisodes(por, 1, 1)).toEqual({ status: 'FINALIZADO', watched: 1 });
  });
  it('favorito marca todo como visto', () => {
    expect(applyFavorite(por, 24)).toEqual({ status: 'FINALIZADO', watched: 24 });
    expect(applyFavorite({ status: 'VIENDO', watched: 3 }, null)).toEqual({ status: 'FINALIZADO', watched: 3 });
  });
  it('Finalizado manual marca todos los episodios; otros estados conservan el progreso', () => {
    expect(applyStatus({ status: 'VIENDO', watched: 3 }, 10, 'FINALIZADO')).toEqual({ status: 'FINALIZADO', watched: 10 });
    expect(applyStatus({ status: 'VIENDO', watched: 3 }, 10, 'DEJADO')).toEqual({ status: 'DEJADO', watched: 3 });
  });
});

describe('minutos vistos', () => {
  it('usa duraciones fijas: serie 50, película 90, anime 23', () => {
    config.useRealRuntime = false;
    expect(DEFAULT_EPISODE_MINUTES).toEqual({ serie: 50, pelicula: 90, anime: 23 });
    expect(minutesWatched('serie', 10, 47)).toBe(500);
    expect(minutesWatched('pelicula', 1)).toBe(90);
    expect(minutesWatched('anime', 12)).toBe(276);
  });
  it('con USE_REAL_RUNTIME usa la duración real si existe', () => {
    config.useRealRuntime = true;
    try {
      expect(episodeMinutes('serie', 47)).toBe(47);
      expect(episodeMinutes('serie', null)).toBe(50);
    } finally {
      config.useRealRuntime = false;
    }
  });
});
