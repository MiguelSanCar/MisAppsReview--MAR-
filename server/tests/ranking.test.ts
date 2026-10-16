import { describe, expect, it } from 'vitest';
import { popularityScore, qualityScore, ratingWithPopularity, rankSearch, titleMatch } from '../src/domain/ranking';

describe('orden de resultados: reglas puras', () => {
  it('coincidencia del título con lo escrito', () => {
    expect(titleMatch('Avatar', 'avatar')).toBe(3);
    expect(titleMatch('Amélie', 'amelie')).toBe(3); // sin acentos ni mayúsculas
    expect(titleMatch('Avatar: El camino del agua', 'avatar')).toBe(2);
    expect(titleMatch('El último Avatar', 'avatar')).toBe(1);
    expect(titleMatch('Avatares', 'avatar')).toBe(2); // empieza por ello
    expect(titleMatch('Otra cosa', 'avatar')).toBe(0);
    expect(titleMatch('Algo', '')).toBe(0);
  });

  it('popularidad y nota acotadas a 0..1', () => {
    expect(popularityScore(0)).toBe(0);
    expect(popularityScore(null)).toBe(0);
    expect(popularityScore(100000)).toBe(1);
    expect(popularityScore(50)).toBeGreaterThan(popularityScore(5));
    expect(qualityScore(5)).toBe(0);
    expect(qualityScore(9.5)).toBe(1);
    expect(qualityScore(null)).toBe(0.5);
  });

  it('la nota manda, pero lo popular tiene preferencia', () => {
    expect(ratingWithPopularity(8.4, 1)).toBeLessThan(ratingWithPopularity(7.4, 400));
    expect(ratingWithPopularity(9, 100)).toBeGreaterThan(ratingWithPopularity(6, 100));
  });

  it('búsqueda: lo más parecido y popular primero; empates conservan el orden', () => {
    const r = rankSearch(
      [
        { title: 'Avatar (documental)', popularity: 2 },
        { title: 'Avatar', popularity: 40 },
        { title: 'Avatar: El camino del agua', popularity: 300 },
        { title: 'La leyenda de Aang: Avatar', popularity: 10 },
        { title: 'Sin relación', popularity: 900 },
      ],
      'avatar',
    );
    expect(r.map((x) => x.title)).toEqual(['Avatar', 'Avatar: El camino del agua', 'Avatar (documental)', 'La leyenda de Aang: Avatar', 'Sin relación']);
    const e = rankSearch([{ title: 'B' }, { title: 'A' }], 'zzz');
    expect(e.map((x) => x.title)).toEqual(['B', 'A']);
  });
});
