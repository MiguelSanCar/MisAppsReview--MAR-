# Referencia de la API

API JSON bajo `/api`. Todas las respuestas de error tienen la forma `{ "error": "mensaje en español" }` (y, a veces, `code` y datos extra). La entrada se valida con zod: los fallos devuelven `400` con el motivo.

- **Autenticación**: cookie `httpOnly` `mar_token` (JWT) que fijan `register` y `login`. «Sesión» en las tablas = requiere cookie válida (`401` si falta).
- **Formato de fechas**: ISO 8601 (UTC).
- **Paginación**: las listas largas usan cursor opaco (`nextCursor`); ver `GET /api/library`.

## Estado

| Método y ruta | Descripción |
|---|---|
| `GET /api/health` | `{ ok: true }` (fuera de producción añade `devSecret`) |
| `GET /api/search/status` | Qué proveedores están disponibles: `{ tmdb, omdb, jikan }` |

## Cuentas y sesión (`/api/auth`)

| Método y ruta | Cuerpo | Descripción |
|---|---|---|
| `POST /register` | `{ username, email, password, theme? }` | Crea la cuenta e inicia sesión. `username` 3–20 caracteres (`A-Za-z0-9_.-`), contraseña de 8 a 100. `theme` (`dark` \| `light`) opcional: tema que la persona ya usaba |
| `POST /login` | `{ identifier, password }` | `identifier` = usuario o correo |
| `POST /logout` | — | Cierra la sesión |
| `GET /me` | — | `{ user }` (o `null`): incluye `email`, `profilePublic`, `showList` y `theme` |
| `POST /forgot` · `POST /reset` | `{ email }` · `{ token, password }` | Recuperar contraseña (el enlace se escribe en el log del servidor mientras no haya SMTP) |
| `POST /verify/send` · `POST /verify` | — · `{ token }` | Verificar el correo |

## Mi cuenta (`/api/me`, sesión)

| Método y ruta | Descripción |
|---|---|
| `GET /profile` | Mi perfil: `user`, `stats` (`totalMinutes`, `watchTime`, `episodes`, `seasonsWatched`, `rewatches` (`contents`, `times`, `episodes`, `totalMinutes`, `watchTime`), `byStatus`, `finishedByType`) y `favorites` |
| `PUT /avatar` · `DELETE /avatar` | `{ dataUrl }` (imagen recortada) · quitar la foto. `GET /api/avatar/:id` la sirve |
| `PUT /visibility` | `{ isPublic, showList }` |
| `PUT /theme` | `{ theme: "dark" \| "light" }` — preferencia guardada en la cuenta |
| `PUT /notifications` | `{ favoritesOnly?, introSeen? }` — ajustes de la campana (solo favoritos; ventana inicial vista). Ambos viajan en `GET /api/auth/me` como `notifFavoritesOnly` y `notifIntroSeen` |
| `GET /export` | Copia de todos los datos de la cuenta |

## Búsqueda y contenido

| Método y ruta | Descripción |
|---|---|
| `GET /api/search?q=&type=` | Búsqueda unificada (TMDB + Jikan). `q` ≥ 2 caracteres; `type` = `todo` \| `serie` \| `pelicula` \| `anime`. Devuelve `results`, `states` (estado de la persona en cada resultado), `warnings` y `tookMs` |
| `GET /api/search/trending?type=` | Lo más visto del momento |
| `GET /api/content/:id` | Ficha: datos, puntuaciones (IMDb, Rotten Tomatoes o MyAnimeList), `seasons` y el `state` de la persona |

### Búsqueda avanzada (`/api/discover`, sesión)

| Método y ruta | Descripción |
|---|---|
| `GET /` | Descubrir series o películas con filtros. Parámetros: `type` (`serie` \| `pelicula`), `sort` (`popularity` \| `rating` \| `date`), `page` (1–500), `genre`, `platform`, `studio` (ids de TMDB), `yearFrom`, `yearTo`, `minRating` (1–9). Devuelve `results`, `states`, `page`, `totalPages`, `hasMore`. Con nota mínima u orden por nota se exigen ≥ 150 votos |
| `GET /providers?type=` | Plataformas de streaming de la región (`TMDB_REGION`, `ES` por defecto) |
| `GET /genres?type=` | Géneros de TMDB en español, por orden alfabético |
| `GET /studios?q=` | Productoras cuyo nombre contiene el texto (2–60 caracteres) |

### Recomendaciones (`/api/recommendations`, sesión)

`GET /?type=serie|pelicula|anime&page=1..500` (scroll sin fin; TMDB no sirve más) — títulos de los géneros con más afinidad, sin repetir lo que ya está en la lista.

```json
{
  "kind": "serie", "title": "Series que has podido ver", "reason": null,
  "items": [{ "id": 12, "title": "…", "why": "Drama", "…": "…" }],
  "genres": [{ "id": 18, "name": "Drama", "score": 2.31, "lift": 1.4, "userShare": 0.62, "marketShare": 0.5, "weight": 7.4 }],
  "page": 1, "hasMore": true, "states": {}, "warnings": []
}
```

`reason` explica un resultado vacío: `sin_datos` (nada en la lista), `anime` (sin géneros en MyAnimeList) o `sin_tmdb` (falta la clave).

## Mi lista (`/api/library`, sesión)

| Método y ruta | Cuerpo | Descripción |
|---|---|---|
| `GET /` | — | Lista paginada. Parámetros: `status`, `type`, `favorite=1`, `q`, `limit` (24 por defecto, máx. 60), `cursor`. Devuelve `{ items, nextCursor, total, counts }` (`counts` solo en el primer lote: `todos`, `favoritos` y uno por estado) |
| `PUT /:id/status` | `{ status }` | `POR_VER` \| `VIENDO` \| `FINALIZADO` \| `DEJADO` |
| `PUT /:id/favorite` | `{ value }` | Favorito (máximo 10) |
| `PUT /:id/later` | `{ value }` | Alterna «Por ver» |
| `PUT /:id/episodes` | `{ watched }` | Episodios vistos; llegar al total finaliza |
| `POST /:id/rewatch` | — | Volver a ver algo finalizado |
| `DELETE /:id` · `POST /delete` | — · `{ ids }` | Quitar de la lista (uno o hasta 500); resta sus episodios y minutos |

## Perfiles (`/api/profiles`)

El acceso se decide en `resolve()`: `self`, `friend`, `public` o `private` (solo se ve que existe).

| Método y ruta | Descripción |
|---|---|
| `GET /:username` | Perfil con estadísticas, favoritas y los permisos (`access`, `canSeeList`, `canSeeFriends`). `403` con `code: "private"` si no es visible |
| `GET /:username/library` | Lista de la persona (mismos parámetros y formato que `/api/library`) |
| `GET /:username/friends` | Amigos (solo amigos) |
| `GET /:username/compare` | Sesión. Compara estadísticas con las de la persona (amiga o de perfil público): `rows` con valor propio y ajeno de cada métrica y quién gana (`me` \| `them` \| `tie`) y `summary` |
| `GET /by-id/:id` | Nombre de usuario de un id (redirecciones antiguas) |

## Amigos (`/api/friends`, `/api/invites`, sesión)

| Método y ruta | Descripción |
|---|---|
| `GET /api/friends` | Amigos y solicitudes enviadas y recibidas |
| `POST /api/friends/requests` | `{ username }` — enviar solicitud |
| `POST /api/friends/requests/:id/accept` · `DELETE /api/friends/requests/:id` | Aceptar o cancelar/rechazar |
| `DELETE /api/friends/:userId` | Eliminar una amistad |
| `POST /api/invites/mine` · `POST /api/invites/revoke` | Crear o renovar mi enlace de amistad / revocarlo |
| `POST /api/invites/request/:userId` | Enlace que, al abrirlo, envía una solicitud a esa persona |
| `GET /api/invites/:token` · `POST /api/invites/:token/accept` | Ver quién creó el enlace / aceptarlo |

## Listas conjuntas (`/api/lists`, sesión)

| Método y ruta | Descripción |
|---|---|
| `GET /` · `GET /with/:username` | Mis listas (y las que dejé) / la lista con un amigo |
| `POST /` | `{ friendId, name? }` — crear (una por pareja) |
| `GET /:id` · `DELETE /:id` | Detalle / borrar |
| `POST /:id/leave` · `POST /:id/join` | Salir sin borrarla / volver a unirse |
| `POST /:id/items` · `PUT /:id/items/:contentId` · `DELETE /:id/items/:contentId` | Añadir (`{ contentId }`), cambiar estado o episodios, quitar |
| `GET /:id/history` · `GET /:id/items/:contentId/history` · `POST /:id/items/:contentId/rollback` | Historial y rollback (`{ historyId }`) |

## Notificaciones (`/api/notifications`, sesión)

Novedades de los contenidos de la lista (temporadas anunciadas o disponibles; películas relacionadas de una serie o de la misma saga). **Estas rutas solo leen de la base de datos y vuelven al instante**: el cálculo, que consulta TMDB, se programa en segundo plano.

| Método y ruta | Descripción |
|---|---|
| `GET /` | `{ items, unseen, favoritesOnly, introSeen, checking }`. Cada item: `id`, `kind` (`season_announced` \| `season_released` \| `related_movie` \| `season_removed` \| `movie_removed`), `text`, `title` (contenido de la lista que lo origina), `createdAt`, `seen`, `contentId` (a dónde lleva: la película nueva si la hay) y `posterUrl`. Máximo 50, de más a menos reciente. Solo los contenidos que siguen en la lista (salvo `movie_removed`, que se muestra aunque la película ya se haya quitado) y, con `favoritesOnly`, solo los favoritos. `checking: true` indica que hay un cálculo en marcha y conviene volver a preguntar en unos segundos |
| `POST /seen` | Marca todo como visto (al abrir la campana): `{ ok, marked }` |

## Roadmap (`/api/roadmap`, público)

| Método y ruta | Descripción |
|---|---|
| `GET /api/roadmap` | Contenido de `roadmap/roadmap.json` |
| `GET/POST/DELETE /api/roadmap/ideas` | Buzón de ideas: solo desde `localhost` (no en producción) |
