/**
 * Datos de demostración para `MOCK_DEMO=1 npm run dev:mock -w server`: títulos conocidos con carátulas generadas
 * (SVG propias, sin imágenes con derechos de autor). Solo para capturas de pantalla y pruebas visuales.
 */
export interface DemoTitle {
  id: number;
  kind: 'tv' | 'movie';
  title: string;
  year: number;
  genres: number[];
  vote: number;
  overview: string;
  /** Episodios de cada temporada (solo series). */
  seasons?: number[];
}

export const DEMO: DemoTitle[] = [
  { id: 1396, kind: 'tv', title: 'Breaking Bad', year: 2008, genres: [18, 80], vote: 8.9, overview: 'Un profesor de química con un diagnóstico terminal se asocia con un antiguo alumno para fabricar metanfetamina.', seasons: [7, 13, 13, 13, 16] },
  { id: 66732, kind: 'tv', title: 'Stranger Things', year: 2016, genres: [10765, 9648, 18], vote: 8.6, overview: 'La desaparición de un niño destapa experimentos secretos y fuerzas sobrenaturales en un pequeño pueblo.', seasons: [8, 9, 8, 9] },
  { id: 70523, kind: 'tv', title: 'Dark', year: 2017, genres: [9648, 10765, 18], vote: 8.7, overview: 'Cuatro familias de un pueblo alemán descubren que el tiempo no es lineal tras la desaparición de unos niños.', seasons: [10, 8, 8] },
  { id: 76331, kind: 'tv', title: 'Succession', year: 2018, genres: [18], vote: 8.8, overview: 'Los hijos de un magnate de los medios compiten por heredar el imperio familiar.', seasons: [10, 10, 9, 10] },
  { id: 136315, kind: 'tv', title: 'The Bear', year: 2022, genres: [18, 35], vote: 8.3, overview: 'Un joven chef vuelve a Chicago para dirigir el restaurante familiar al borde de la ruina.', seasons: [8, 10, 10] },
  { id: 95396, kind: 'tv', title: 'Severance', year: 2022, genres: [18, 9648, 10765], vote: 8.4, overview: 'Empleados que separan quirúrgicamente su memoria laboral de la personal empiezan a hacerse preguntas.', seasons: [9, 10] },
  { id: 106379, kind: 'tv', title: 'Fallout', year: 2024, genres: [10765, 10759], vote: 8.2, overview: 'Doscientos años después del apocalipsis nuclear, una habitante de un refugio sale a la superficie.', seasons: [8] },
  { id: 126308, kind: 'tv', title: 'Shōgun', year: 2024, genres: [18, 10768], vote: 8.5, overview: 'Un navegante inglés naufraga en el Japón feudal en plena guerra por el poder.', seasons: [10] },
  { id: 87108, kind: 'tv', title: 'Chernobyl', year: 2019, genres: [18], vote: 8.7, overview: 'La historia del peor desastre nuclear de la humanidad y de quienes evitaron algo aún peor.', seasons: [5] },
  { id: 100088, kind: 'tv', title: 'The Last of Us', year: 2023, genres: [18, 10765], vote: 8.4, overview: 'Un superviviente escolta a una adolescente a través de unos Estados Unidos devastados por una infección.', seasons: [9, 7] },
  { id: 94997, kind: 'tv', title: 'House of the Dragon', year: 2022, genres: [10765, 18, 10759], vote: 8.3, overview: 'La guerra civil de los Targaryen, dos siglos antes de los sucesos de Juego de Tronos.', seasons: [10, 8] },
  { id: 42009, kind: 'tv', title: 'Black Mirror', year: 2011, genres: [18, 10765], vote: 8.3, overview: 'Antología sobre los lados más oscuros de la tecnología y de la sociedad moderna.', seasons: [3, 3, 6, 6, 6, 5] },
  { id: 97546, kind: 'tv', title: 'Ted Lasso', year: 2020, genres: [35, 18], vote: 8.4, overview: 'Un entrenador de fútbol americano universitario acepta dirigir a un equipo de fútbol inglés.', seasons: [10, 12, 12] },
  { id: 60059, kind: 'tv', title: 'Better Call Saul', year: 2015, genres: [18, 80], vote: 8.6, overview: 'El camino de un abogado de poca monta hasta convertirse en Saul Goodman.', seasons: [10, 10, 10, 10, 13, 13] },
  { id: 1668, kind: 'tv', title: 'Friends', year: 1994, genres: [35], vote: 8.4, overview: 'Seis amigos y sus vidas, amores y trabajos en Nueva York.', seasons: [24, 24, 25, 24, 24, 25, 24, 24, 24, 18] },
  { id: 1399, kind: 'tv', title: 'Juego de Tronos', year: 2011, genres: [10765, 18, 10759], vote: 8.5, overview: 'Nueve familias nobles luchan por el control de Poniente mientras una antigua amenaza despierta.', seasons: [10, 10, 10, 10, 10, 10, 7, 6] },

  { id: 27205, kind: 'movie', title: 'Origen', year: 2010, genres: [28, 878, 12], vote: 8.4, overview: 'Un ladrón que roba secretos a través de los sueños recibe el encargo de implantar una idea.' },
  { id: 157336, kind: 'movie', title: 'Interstellar', year: 2014, genres: [12, 18, 878], vote: 8.4, overview: 'Un grupo de astronautas viaja a través de un agujero de gusano en busca de un nuevo hogar para la humanidad.' },
  { id: 496243, kind: 'movie', title: 'Parásitos', year: 2019, genres: [35, 18], vote: 8.5, overview: 'Una familia sin recursos se infiltra poco a poco en la vida de una familia adinerada.' },
  { id: 438631, kind: 'movie', title: 'Dune', year: 2021, genres: [878, 12], vote: 7.8, overview: 'El joven Paul Atreides viaja al planeta más peligroso del universo para asegurar el futuro de su familia.' },
  { id: 872585, kind: 'movie', title: 'Oppenheimer', year: 2023, genres: [18, 36], vote: 8.1, overview: 'La historia del físico que dirigió el Proyecto Manhattan y su dilema moral.' },
  { id: 569094, kind: 'movie', title: 'Spider-Man: Cruzando el Multiverso', year: 2023, genres: [16, 28, 12], vote: 8.4, overview: 'Miles Morales se lanza a un viaje por el multiverso junto a Gwen Stacy.' },
  { id: 76341, kind: 'movie', title: 'Mad Max: Furia en la carretera', year: 2015, genres: [28, 12, 878], vote: 7.6, overview: 'En un páramo desolado, una guerrera y un fugitivo huyen de un tirano a través del desierto.' },
  { id: 238, kind: 'movie', title: 'El padrino', year: 1972, genres: [18, 80], vote: 8.7, overview: 'El patriarca de una dinastía criminal transfiere el control a su reacio hijo.' },
  { id: 603, kind: 'movie', title: 'Matrix', year: 1999, genres: [28, 878], vote: 8.2, overview: 'Un programador descubre que la realidad es una simulación y se une a la rebelión.' },
  { id: 120467, kind: 'movie', title: 'El gran hotel Budapest', year: 2014, genres: [35, 18], vote: 8.0, overview: 'Las aventuras de un legendario conserje y su joven protegido en un célebre hotel europeo.' },
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Carátula SVG generada: degradado según el título y el nombre en grande (sin imágenes con derechos). */
export function posterSvg(t: DemoTitle): string {
  const h = hash(t.title) % 360;
  const words = t.title.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 12 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  const text = lines.slice(0, 4).map((l, i) => `<tspan x="150" dy="${i === 0 ? 0 : 34}">${l.replace(/&/g, '&amp;')}</tspan>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 55% 32%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 60% 14%)"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><circle cx="240" cy="70" r="90" fill="hsl(${(h + 20) % 360} 70% 60%)" opacity=".18"/><text x="150" y="${190 - Math.min(lines.length, 3) * 12}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="30" fill="#fff" opacity=".95">${text}</text><text x="150" y="418" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#fff" opacity=".6">${t.year}</text></svg>`;
}

const toResult = (t: DemoTitle) => ({
  id: t.id,
  [t.kind === 'tv' ? 'name' : 'title']: t.title,
  poster_path: `/${t.id}.svg`,
  [t.kind === 'tv' ? 'first_air_date' : 'release_date']: `${t.year}-06-01`,
  overview: t.overview,
  original_language: 'en',
  genre_ids: t.genres,
  vote_average: t.vote,
});

/** Respuestas de TMDB para el modo demo; null = no es una ruta del modo demo (sigue el simulador normal). */
export function demoTmdb(p: string, q: URLSearchParams): unknown | null {
  let m = /^\/tmdb\/trending\/(tv|movie)\/week$/.exec(p);
  if (m) return { results: DEMO.filter((t) => t.kind === m![1]).map(toResult) };
  if (p === '/tmdb/search/multi') {
    const s = (q.get('query') ?? '').toLowerCase();
    return { results: DEMO.filter((t) => t.title.toLowerCase().includes(s)).map((t) => ({ ...toResult(t), media_type: t.kind })) };
  }
  m = /^\/tmdb\/discover\/(tv|movie)$/.exec(p);
  if (m) {
    const kind = m[1];
    let list = DEMO.filter((t) => t.kind === kind);
    const g = q.get('with_genres');
    if (g) { const ids = g.split('|').map(Number); list = list.filter((t) => t.genres.some((x) => ids.includes(x))); }
    const min = Number(q.get('vote_average.gte'));
    if (min) list = list.filter((t) => t.vote >= min);
    const from = q.get('first_air_date.gte') ?? q.get('primary_release_date.gte');
    const to = q.get('first_air_date.lte') ?? q.get('primary_release_date.lte');
    if (from) list = list.filter((t) => t.year >= Number(from.slice(0, 4)));
    if (to) list = list.filter((t) => t.year <= Number(to.slice(0, 4)));
    const sort = q.get('sort_by') ?? '';
    if (sort.startsWith('vote_average')) list = [...list].sort((a, b) => b.vote - a.vote);
    else if (sort.includes('date')) list = [...list].sort((a, b) => b.year - a.year);
    const page = Number(q.get('page') ?? 1);
    if (!q.has('watch_region')) return { page, total_pages: 1, results: page > 1 ? [] : list.map(toResult) };
    const per = 10;
    return { page, total_pages: Math.max(1, Math.ceil(list.length / per)), total_results: list.length, results: list.slice((page - 1) * per, page * per).map(toResult) };
  }
  m = /^\/tmdb\/(tv|movie)\/(\d+)$/.exec(p);
  if (m) {
    const t = DEMO.find((x) => x.kind === m![1] && x.id === Number(m![2]));
    if (!t) return null;
    const base = { overview: t.overview, poster_path: `/${t.id}.svg`, genres: t.genres.map((id) => ({ id, name: String(id) })), production_companies: [{ name: 'Estudio de muestra' }] };
    return t.kind === 'tv'
      ? { ...base, name: t.title, first_air_date: `${t.year}-06-01`, number_of_episodes: (t.seasons ?? []).reduce((a, b) => a + b, 0), episode_run_time: [50], seasons: (t.seasons ?? []).map((n, i) => ({ season_number: i + 1, episode_count: n })), external_ids: {} }
      : { ...base, title: t.title, release_date: `${t.year}-06-01`, runtime: 115 };
  }
  return null;
}
