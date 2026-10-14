import http from 'http';
import type { AddressInfo } from 'net';

/** Servidor local que imita TMDB, Jikan y OMDb (no hay acceso a las APIs reales en los tests). */
export function startMockProviders(): Promise<{ base: string; close: () => Promise<void>; calls: string[] }> {
  const calls: string[] = [];
  const movies = Array.from({ length: 12 }, (_, i) => ({
    id: 101 + i, media_type: 'movie', title: `Pelicula ${i + 1}`, poster_path: '/p.jpg',
    release_date: '2010-01-01', overview: `Sinopsis ${i + 1}`, original_language: 'en', genre_ids: [28],
  }));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    calls.push(url.pathname);
    const p = url.pathname;

    if (p.startsWith('/tmdb/')) {
      if (url.searchParams.get('api_key') !== 'tmdb-key') return send(401, { status_message: 'Invalid API key' });
      if (p === '/tmdb/trending/tv/week') {
        return send(200, {
          results: [
            { id: 3001, name: 'Serie en tendencia 1', poster_path: '/t1.jpg', first_air_date: '2024-01-01', original_language: 'en', genre_ids: [18] },
            { id: 3002, name: 'Serie en tendencia 2', poster_path: '/t2.jpg', first_air_date: '2023-05-01', original_language: 'en', genre_ids: [35] },
            { id: 3003, name: 'Anime en tendencia de TMDB', original_language: 'ja', genre_ids: [16] },
          ],
        });
      }
      if (p === '/tmdb/trending/movie/week') {
        return send(200, { results: [{ id: 4001, title: 'Película en tendencia', poster_path: '/m1.jpg', release_date: '2024-03-03', original_language: 'en', genre_ids: [28] }] });
      }
      if (p === '/tmdb/search/multi') {
        return send(200, {
          results: [
            { id: 1396, media_type: 'tv', name: 'Breaking Bad', poster_path: '/bb.jpg', first_air_date: '2008-01-20', overview: 'Un profesor...', original_language: 'en', genre_ids: [18] },
            { id: 999, media_type: 'tv', name: 'Anime en TMDB', original_language: 'ja', genre_ids: [16] },
            { id: 5, media_type: 'person', name: 'Una persona' },
            ...movies,
          ],
        });
      }
      let m = /^\/tmdb\/movie\/(\d+)$/.exec(p);
      if (m) {
        return send(200, {
          title: `Pelicula ${Number(m[1]) - 100}`, overview: 'Detalle', runtime: 100, imdb_id: `tt00${m[1]}`,
          release_date: '2010-01-01', poster_path: '/p.jpg', production_companies: [{ name: 'Studio X' }],
          genres: [{ id: 28, name: 'Acción' }],
        });
      }
      m = /^\/tmdb\/tv\/1396$/.exec(p);
      if (m) {
        return send(200, {
          name: 'Breaking Bad', overview: 'Detalle serie', number_of_episodes: 62, episode_run_time: [47],
          first_air_date: '2008-01-20', poster_path: '/bb.jpg', production_companies: [{ name: 'Sony' }],
          networks: [{ name: 'AMC' }], external_ids: { imdb_id: 'tt0903747' },
          genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crimen' }],
        });
      }
      const GENRES: Record<string, Record<number, string>> = {
        tv: { 18: 'Drama', 35: 'Comedia', 80: 'Crimen', 9648: 'Misterio', 10759: 'Action & Adventure', 10765: 'Sci-Fi & Fantasy' },
        movie: { 28: 'Acción', 35: 'Comedia', 18: 'Drama', 27: 'Terror', 878: 'Ciencia ficción', 14: 'Fantasía' },
      };
      const gl = /^\/tmdb\/genre\/(tv|movie)\/list$/.exec(p);
      if (gl) return send(200, { genres: Object.entries(GENRES[gl[1]]).map(([id, name]) => ({ id: Number(id), name })) });
      const dc = /^\/tmdb\/discover\/(tv|movie)$/.exec(p);
      if (dc) {
        const kind = dc[1];
        const wg = url.searchParams.get('with_genres');
        const page = Number(url.searchParams.get('page') ?? 1);
        const titleKey = kind === 'tv' ? 'name' : 'title';
        const dateKey = kind === 'tv' ? 'first_air_date' : 'release_date';
        if (!wg) {
          // «el mercado»: los títulos más populares; el Drama (series) o la Acción (películas) domina
          const market = kind === 'tv' ? [[18], [18, 80], [18], [18, 9648], [18], [35], [35], [80], [10759], [10765]] : [[28], [28], [28], [35], [35], [18], [18], [27], [878], [14]];
          if (page > 1) return send(200, { results: [] });
          return send(200, { results: market.map((g, i) => ({ id: 7000 + i, [titleKey]: `Popular ${i}`, [dateKey]: '2024-01-01', original_language: 'en', genre_ids: g, vote_average: 7.5 })) });
        }
        const out: any[] = [];
        for (const id of wg.split('|').map(Number)) {
          for (let i = 0; i < 6; i++) {
            out.push({ id: id * 10 + i, [titleKey]: `${GENRES[kind][id] ?? 'Género ' + id} ${kind === 'tv' ? 'serie' : 'película'} ${i}`, poster_path: '/d.jpg', [dateKey]: '2022-02-02', original_language: 'en', genre_ids: i === 0 ? [id, 18] : [id], vote_average: 6.5 + i * 0.4 });
          }
        }
        if (kind === 'tv' && wg.split('|').includes('18')) out.unshift({ id: 1396, name: 'Breaking Bad', poster_path: '/bb.jpg', first_air_date: '2008-01-20', original_language: 'en', genre_ids: [18, 80], vote_average: 9.5 });
        return send(200, { results: out });
      }
      return send(404, {});
    }

    if (p === '/jikan/top/anime') return send(200, { data: [anime(9001, 'Anime en emisión', 12, 'TV')] });
    if (p === '/slow/anime') {
      // proveedor lento: tarda más que el límite de espera de la búsqueda
      setTimeout(() => send(200, { data: [anime(20, 'Naruto', 220, 'TV')] }), 700);
      return;
    }
    if (p === '/jikan/anime') {
      return send(200, { data: [anime(20, 'Naruto', 220, 'TV')] });
    }
    if (p === '/jikan/anime/20') return send(200, { data: anime(20, 'Naruto', 220, 'TV') });
    if (p === '/jikan/anime/5114') return send(200, { data: anime(5114, 'Pelicula anime', 1, 'Movie') });

    if (p === '/omdb/') {
      if (url.searchParams.get('apikey') !== 'omdb-key') return send(401, { Response: 'False', Error: 'Invalid API key!' });
      const id = url.searchParams.get('i');
      if (id === 'tt0903747') {
        return send(200, {
          Response: 'True', imdbRating: '9.5',
          Ratings: [{ Source: 'Internet Movie Database', Value: '9.5/10' }, { Source: 'Rotten Tomatoes', Value: '96%' }],
        });
      }
      return send(200, { Response: 'True', imdbRating: '7.1', Ratings: [{ Source: 'Internet Movie Database', Value: '7.1/10' }] });
    }
    send(404, {});
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ base: `http://127.0.0.1:${port}`, calls, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

function anime(id: number, title: string, episodes: number, type: string) {
  return {
    mal_id: id, title, title_english: title, type, episodes, duration: '23 min per ep', score: 8.01, year: 2002,
    synopsis: 'Un ninja...', studios: [{ name: 'Pierrot' }], images: { jpg: { image_url: 'https://cdn.myanimelist.net/x.jpg' } },
  };
}
