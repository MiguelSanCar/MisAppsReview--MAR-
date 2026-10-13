# Instrucciones

## Forma de programación

 - Siempre que te diga un cambio, añádelo al Roadmap en la prioridad que te he dicho; en caso de no habértela dado, asúmela según las demás tareas (puedes fraccionar, renumerar y reordenar).

 - Siempre que te diga cambios, NO rompas el ciclo de desarrollo: sigue con el roadmap y para SOLO cuando lo hayas finalizado. Quedan fuera de ese "finalizado" las tareas que dependan de algo externo (p. ej. una cuenta de hosting) o que yo haya dejado en espera / prioridad baja; al terminar, enuméralas.

 - Documenta TODO, modifica el README cuando lo requiera y sube los cambios periódicamente a GitHub (`origin/main`). Commits pequeños con Conventional Commits. Nunca subas `.env`, bases de datos (`data/`, `*.db`), `certs/` ni `tools/` (ya están en `.gitignore`).

## Proyecto

MAR (Mis Apps Review): app web personal para registrar series, películas y anime (vistos, en curso, pendientes), con perfil, amigos, listas conjuntas y un roadmap público. Hecha con Claude Code como prueba. Todo en español (interfaz, mensajes de error, documentación y respuestas); código y nombres técnicos en inglés/español según el contexto del fichero.

Estado, decisiones y cómo levantarlo: `README.md`, `docs/CHANGELOG.md`, `docs/DECISIONES.md`, `docs/DESPLIEGUE.md`. Este fichero solo recoge lo que no está allí.

## Entorno (restricciones)

 - Windows, **Node 16.20.2** / npm 8. Todo debe funcionar ahí: Vite 4, Vitest 0.34, `ts-node-dev` (nada que exija Node 18+, ni `tsx`, ni `fetch` global: usar `getJson` de `server/src/http.ts`).
 - Git: usar `git`; si no responde, el portable en `C:\Users\mascarneiro.INDRA\Downloads\PortableGit`.
 - Red corporativa (Netskope): re-firma HTTPS; Node necesita `certs/corporate-ca.pem` (lo pasa `scripts/ca.js` a `dev` y `share`). Jikan/MyAnimeList y `image.tmdb.org` no responden desde esta red/terminal; TMDB y OMDb sí. Nunca desactivar la verificación TLS.
 - PowerShell está en modo restringido (no se pueden llamar métodos .NET): usar cmdlets.
 - El `.env` real tiene `JWT_SECRET`, `TMDB_API_KEY` y `OMDB_API_KEY`: no los imprimas ni los copies a otros ficheros.

## Comandos

```bash
npm run dev                       # API :3001 (también sirve client/dist) + Vite :5173 con proxy /api
npm run share                     # túnel Cloudflare a :3001 (requiere `npm run dev` y tools/cloudflared); se niega con el JWT_SECRET por defecto
npm test                          # Vitest del servidor (124 tests)
npm run build                     # client/dist y server/dist
npm run dev:mock -w server        # app con TMDB/Jikan/OMDb simulados en :3101 (necesita build del cliente); JOINT_INACTIVITY_DAYS / JOINT_WARNING_DAYS cortos para probar avisos
npm run mail:test -w server -- tu@correo.com   # comprueba SMTP (base lista, aún sin usar)
```

## Arquitectura

 - `server/src`: `app.ts` (middleware, rutas, manejador de errores), `config.ts` (**se lee en cada uso**: los tests lo modifican), `db.ts` + `migrations.ts`, `cache.ts`, `http.ts`, `providers/` (tmdb, jikan, omdb), `content.ts` (búsqueda, sugerencias, tendencias, ficha), `library.ts`, `profile.ts` (estadísticas), `listLife.ts` (inactividad y borrado), `mailer.ts`, `roadmap.ts`, `domain/` (reglas puras: `time.ts`, `rules.ts`), `routes/` (auth, account, friends, profiles, invites, lists, library).
 - `client/src`: `App.tsx` (rutas), `auth/`, `profile/` (contexto y envoltorio de `/perfil/:username`), `components/`, `pages/`, `roadmap/`, `config.ts` (`LIVE_SEARCH`), `api.ts` (`ApiError.data`, cancelación), `clipboard.ts`.
 - **BD**: SQLite con `sql.js` (en memoria, se vuelca a `data/mar.db` 300 ms tras escribir). **Un solo proceso por fichero**: dos servidores sobre la misma BD se pisarían. Migraciones numeradas (hoy 8): nunca editar una publicada, añadir otra. `db.export()` reinicia la conexión: se reactiva `PRAGMA foreign_keys` tras cada volcado.
 - Express 4: los handlers `async` van envueltos en `ah(...)`; los errores con `HttpError(status, mensaje)` (puede llevar `code`/`extra`); validación con zod vía `parse()`.
 - Los proveedores externos solo se llaman desde el servidor. Búsquedas: caché **en memoria** (`memCached`); fichas y OMDb: caché persistente (`cached`). `guarded()` corta 60 s un proveedor caído y la búsqueda no espera más de `searchSoftMs`.

## Reglas de negocio que no son obvias

 - Favorito (máx. 10) = Finalizado con todos los episodios; quitarlo solo lo saca de favoritos. Episodios: enteros; llegar o superar el total fija el máximo y finaliza. Película = 1 episodio. Horas = episodios vistos × duración fija (serie 50, película 90, anime 23 min; `USE_REAL_RUNTIME=true` usa la real). Formato: horas → días → semanas → meses → años.
 - Perfil: `/perfil/<usuario>`, **solo amigos por defecto** o público; la lista solo si se permite; los amigos de alguien nunca son públicos. Todo el acceso se decide en `resolve()` (`routes/profiles.ts`).
 - Enlaces de amistad (`invite_links`): el propio añade como amigo a quien lo abre; el de otro perfil solo **envía una solicitud**. Cada enlace guarda quién lo generó y se puede renovar.
 - Listas conjuntas: una por pareja (`maxListsPerPair`), la crea cualquiera de los dos; salir no la borra (`left_at`); se borra tras 60 días sin actividad (ver no cuenta) con aviso en la app 15 días antes. El aviso por correo (12.10/12.12) está pendiente.
 - Filtros de tarjeta en «Mi lista»: la flecha avanza de fase solo en «Por ver» y «Viendo».

## Roadmap y versiones

 - `roadmap/roadmap.json` es la fuente de verdad (fases > funcionalidades > tareas; estados `pendiente` | `en_progreso` | `hecho`); la página pública `/roadmap` lo lee y es solo lectura. Actualízalo al terminar cada tarea y al recibir cambios.
 - Versión 0.x: fase N completada = `0.(N+1).0` (`package.json` y `roadmap.json`). Al cerrar una fase: CHANGELOG, DECISIONES si hay decisión nueva, README si cambia algo visible, y subir a GitHub.
 - Pendiente conocido: hosting (5.1, 5.3, necesita cuenta) y correo (12.10, 12.12, prioridad baja).

## Pruebas

 - Todo cambio de servidor lleva test en `server/tests` (Vitest; `tests/client.ts` arranca la app con proveedores simulados de `mock-providers.ts` y BD en memoria). Los cambios de interfaz se comprueban en un navegador real: `puppeteer-core` + Edge headless contra `dev:mock`, con capturas, desde el directorio temporal de la sesión (no se añade al repo).
 - Las APIs reales se probaron a mano con las claves del `.env` (TMDB y OMDb); Jikan no se ha podido probar desde esta red.

## Trampas conocidas

 - Comandos de shell largos con muchas comillas fallan ("unexpected EOF"): escribe el script en un fichero (Write/Edit) y ejecútalo. Cuidado con `\d`, `\/` en cadenas de TypeScript/JS.
 - Si `vite.config.ts` cambia con `npm run dev` en marcha, Vite se reinicia y pierde el proxy `/api`: reinicia `npm run dev`.
 - Cambios del cliente: `npm run share` y `npm start` sirven `client/dist`, hay que recompilar. Los del servidor se recargan solos con `ts-node-dev`.
 - `trust proxy` es `loopback` en local (para el túnel) y `1` en producción; la cookie de sesión es `Secure` solo si la petición llegó por HTTPS.
