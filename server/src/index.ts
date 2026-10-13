import { createApp } from './app';
import { purgeExpiredCache } from './cache';
import { config } from './config';
import { openDb } from './db';
import { startMaintenance } from './listLife';
import { omdbAvailable } from './providers/omdb';
import { tmdbAvailable } from './providers/tmdb';

async function main() {
  await openDb();
  purgeExpiredCache();
  startMaintenance();
  createApp().listen(config.port, () => {
    console.log(`Servidor MAR en http://localhost:${config.port}`);
    console.log(`  Base de datos: ${config.dbFile}`);
    if (!tmdbAvailable()) console.log('  ⚠ Falta TMDB_API_KEY: no habrá búsqueda de series ni películas (el anime sí).');
    if (!omdbAvailable()) console.log('  ⚠ Falta OMDB_API_KEY: no se mostrarán las puntuaciones de IMDb ni Rotten Tomatoes.');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
