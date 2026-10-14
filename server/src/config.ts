import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET es obligatorio en producción');
}

export const DEV_JWT_SECRET = 'dev-secret-solo-para-local';

// Los valores se leen en cada uso (los tests modifican este objeto).
export const config = {
  isProd,
  port: Number(env.PORT) || 3001,
  jwtSecret: env.JWT_SECRET || DEV_JWT_SECRET,
  // Fichero SQLite (se guarda en disco). En el despliegue debe apuntar a un disco persistente.
  dbFile: env.DB_FILE ? path.resolve(env.DB_FILE) : path.resolve(__dirname, '../../data/mar.db'),
  clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),

  tmdbKey: env.TMDB_API_KEY || '',
  omdbKey: env.OMDB_API_KEY || '',
  tmdbBase: env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
  tmdbImageBase: env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p/w342',
  // Región para saber en qué plataformas (Netflix, HBO…) está disponible cada título.
  tmdbRegion: (env.TMDB_REGION || 'ES').toUpperCase(),
  // Novedades (notificaciones): todo el cálculo va en segundo plano y con límites, para no perjudicar al resto de la app.
  newsTtlActiveMs: Number(env.NEWS_TTL_ACTIVE_MS ?? 12 * 3600_000), // series en emisión o previstas
  newsTtlIdleMs: Number(env.NEWS_TTL_IDLE_MS ?? 7 * 86400_000), //     series terminadas y películas
  newsRelatedTtlMs: Number(env.NEWS_RELATED_TTL_MS ?? 7 * 86400_000), // búsqueda de películas relacionadas de una serie
  newsBudget: Number(env.NEWS_BUDGET ?? 30), //       contenidos que se consultan por ronda
  newsConcurrency: Number(env.NEWS_CONCURRENCY ?? 3), // peticiones simultáneas a TMDB (global)
  newsRoundDelayMs: Number(env.NEWS_ROUND_DELAY_MS ?? 4000), // pausa entre rondas de una misma persona
  newsUserIntervalMs: Number(env.NEWS_USER_INTERVAL_MS ?? 30 * 60_000), // cada cuánto se programa un refresco por persona
  newsRetryMs: Number(env.NEWS_RETRY_MS ?? 15 * 60_000), // espera antes de reintentar un contenido que falló
  jikanBase: env.JIKAN_BASE_URL || 'https://api.jikan.moe/v4',
  omdbBase: env.OMDB_BASE_URL || 'https://www.omdbapi.com',
  providerTimeoutMs: Number(env.PROVIDER_TIMEOUT_MS) || 8000,
  jikanTimeoutMs: Number(env.JIKAN_TIMEOUT_MS) || 5000,
  // Tiempo máximo que una búsqueda espera a CADA proveedor antes de devolver lo que ya tenga. TMDB es la fuente
  // principal (y a través de un proxy corporativo la primera conexión puede tardar); Jikan es opcional y a veces
  // está bloqueado, así que se le espera menos.
  tmdbSoftMs: Number(env.TMDB_SOFT_MS) || 6000,
  jikanSoftMs: Number(env.JIKAN_SOFT_MS) || 2000,
  // false = no consultar Jikan/MyAnimeList (p. ej. si la red lo bloquea): sin esperas ni avisos.
  jikanEnabled: env.JIKAN_ENABLED !== 'false',
  // Corte de un proveedor caído: primera espera y máximo (se duplica con cada fallo seguido).
  providerDownMs: Number(env.PROVIDER_DOWN_MS ?? 60_000),
  providerDownMaxMs: Number(env.PROVIDER_DOWN_MAX_MS ?? 15 * 60_000),
  jikanMinGapMs: Number(env.JIKAN_MIN_GAP_MS ?? 400),

  // Duración real de las APIs (tarea 4.6). Por defecto: duraciones fijas por tipo.
  useRealRuntime: env.USE_REAL_RUNTIME === 'true',

  // Correo (SMTP). Base lista pero sin usar todavía; ver src/mailer.ts.
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === 'true', // true = TLS directo (puerto 465)
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'MAR <no-reply@localhost>',
  },

  // Listas conjuntas: se borran tras `jointInactivityDays` sin actividad; se avisa `jointWarningDays` antes.
  jointInactivityDays: Number(env.JOINT_INACTIVITY_DAYS) || 60,
  jointWarningDays: Number(env.JOINT_WARNING_DAYS) || 15,
  // Por ahora una lista conjunta por pareja (el modelo admite varias).
  maxListsPerPair: 1,

  favoritesMax: 10,
  jointHistoryLimit: Math.max(15, Number(env.JOINT_HISTORY_LIMIT) || 50),
  authRateLimit: Number(env.AUTH_RATE_LIMIT) || 30,

  // Fichero con el roadmap (solo lectura desde la web) y buzón de ideas (solo local).
  roadmapFile: path.resolve(__dirname, '../../roadmap/roadmap.json'),
  ideasFile: path.resolve(__dirname, '../../roadmap/ideas.json'),
};
