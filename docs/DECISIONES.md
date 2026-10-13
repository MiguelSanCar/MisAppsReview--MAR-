# Decisiones técnicas

| Decisión | Motivo |
|---|---|
| **Node 16.20.2** como objetivo | Es la versión instalada en el equipo. Obliga a fijar versiones compatibles. |
| **Vite 4.5** (no 5) | Vite 5 exige Node 18 o superior. |
| **ts-node-dev** en el servidor (no `tsx`) | `tsx` exige Node 18 o superior. |
| **Vitest 0.34** | Última línea compatible con Node 16. |
| **React 18 + React Router 6 + TypeScript** | Estándar, ligero y tipado. |
| **Express 4** | Estable y con soporte para Node 16. |
| **npm workspaces** | Un solo `npm install` y un solo `npm run dev` para cliente y servidor. |
| **`scripts/dev.js` propio** | Imprime las URLs y mata el árbol de procesos en Windows al parar. |
| **SQLite con `sql.js`** (no Prisma ni `better-sqlite3`) | `better-sqlite3` necesita compilar (no compila en este equipo) y Prisma descarga binarios. `sql.js` es WASM puro: cero compilación, igual en Windows y en Docker. La BD está en memoria y se vuelca a fichero (con atomic rename) 300 ms tras cada escritura y al cerrar. Suficiente para uso personal/pequeño; con mucha concurrencia habría que pasar a un SQLite nativo o Postgres. |
| **SQL a mano + migraciones propias** | Esquema pequeño; evita un ORM. Las migraciones están numeradas y no se editan una vez publicadas. |
| **`export()` de sql.js reinicia la conexión** | Se reactiva `PRAGMA foreign_keys = ON` tras cada volcado (si no, se perderían los `ON DELETE CASCADE`). |
| **Sin `fetch`** (Node 16) | Cliente HTTP propio sobre `http/https` con timeout; sirve también para los servidores simulados de los tests. |
| **Proveedores externos solo desde el servidor** | Las claves no llegan al navegador; permite caché compartida. |
| **Caché persistente en BD** | OMDb gratuito da ~1.000 consultas/día; Jikan ~3/s. Si el proveedor falla se sirve el dato caducado. |
| **Rotten Tomatoes vía OMDb** | RT no tiene API pública; OMDb devuelve su Tomatometer en la misma petición que IMDb (a veces falta → "—"). Filmaffinity descartado (sin API, scraping frágil). |
| **Duración fija por tipo** (50 / 90 / 23 min) | Decisión del usuario para empezar; la real queda tras `USE_REAL_RUNTIME`. |
| **Contenido guardado al buscar** | Cada resultado se guarda en `content`, así los botones ♥ / ↪ actúan sobre un id local; los datos completos (episodios totales, estudio…) se piden al abrir la ficha o al marcar. |
| **Total de episodios desconocido** (`NULL`) | Anime en emisión: sin tope; no se auto-finaliza. |
| **Reglas de dominio puras en `domain/`** | `formatDuration` y las reglas de estados/episodios se testean sin servidor ni BD. |
| **Sesión: JWT en cookie httpOnly sameSite=lax** | No accesible desde JS; en producción `Secure` según `req.secure` (se activa tras el proxy HTTPS). |
| **Avatar: recorte en el cliente, JPEG 256×256 en BD** | Sin almacenamiento de ficheros; se valida el tipo real por la cabecera del fichero (no SVG). |
| **Perfil compartido: token aleatorio, desactivado por defecto** | Privado salvo que el usuario lo active; regenerar el token revoca el enlace. |
| **Amistad: solicitud + aceptación** | Evita que alguien vea el perfil de otra persona sin consentimiento. |
| **Historial de lista conjunta: por modificación, recorte global por lista** | Se guarda estado anterior y posterior; el rollback fija el estado "tras esa modificación" y se registra como una entrada más. Límite 50 (mínimo 15), recorta las más antiguas de toda la lista. |
| **Roadmap en `roadmap.json` + polling de 4 s** | Más simple que SSE o file watchers. Funciona igual en local y desplegado. |
| **Roadmap solo lectura** | Lo mantiene Claude editando el JSON; no hay endpoints de escritura del roadmap. |
| **Buzón de ideas solo local** | Es la única escritura; solo desde `localhost`, fuera de producción y sin cabecera `x-forwarded-for`. |
| **CSS plano** (sin Tailwind ni librerías de UI) | La interfaz es pequeña; evita dependencias. |
| **Correo simulado** | Sin servicio SMTP, los enlaces de recuperación/verificación se escriben en consola (y en pantalla en local). |
| **`NODE_EXTRA_CA_CERTS` en vez de desactivar TLS** | Detrás de un proxy corporativo que re-firma HTTPS, se añade confianza en la CA de la empresa (certs/, ignorado por git). Nunca `NODE_TLS_REJECT_UNAUTHORIZED=0`. |
| **Corte automático de proveedores con retroceso** | Si TMDB/Jikan no responden (bloqueo, timeout, 5xx) no se reintenta durante 1 min; cada fallo seguido duplica la pausa hasta 15 min y responder la reinicia. Los errores de la API (401, 404) no lo activan. |
| **Un solo servidor y una sola BD al compartir** | Con dos servidores (dev y share) cada uno tenía su BD y aparecían cuentas duplicadas e inconsistentes; sql.js guarda la BD entera en memoria, así que dos procesos sobre el mismo fichero se pisarían. El túnel apunta al servidor de desarrollo; el script exige un `JWT_SECRET` propio. |
| **`trust proxy = loopback` en local** | Solo se confía en cabeceras `X-Forwarded-*` de proxies del propio equipo (el túnel); en producción, 1 salto. |
| **Búsquedas en caché de memoria, no en BD** | Con búsqueda al escribir habría una escritura (y un volcado completo de sql.js) por pulsación. La caché en memoria comparte además las peticiones simultáneas (dos búsquedas simultáneas iguales = una sola llamada a TMDB). |
| **Límite de espera por proveedor (3,5 s)** | Una API lenta o bloqueada (Jikan en la red corporativa) no retrasa la respuesta: se devuelve lo que ya hay, se avisa y su respuesta queda en caché. |
| **Enlaces de amistad con token y autor** | `invite_links` guarda quién generó cada enlace (`creator_id`), de qué tipo (`befriend` / `request`) y a quién va dirigido. El mismo enlace se reutiliza hasta renovarlo. Aceptarlo exige sesión; el de «solicitud» no añade directamente, solo envía la solicitud. |
| **Perfil por nombre de usuario (`/perfil/<usuario>`)** | Dirección legible y única (el usuario ya es único sin distinguir mayúsculas). Implica que el nombre no se puede cambiar (no hay función de renombrar). |
| **Visibilidad: solo amigos por defecto** | Más privado que antes. Público = cualquiera con la URL, también sin cuenta; los amigos de una persona nunca son públicos y la lista solo si lo permite. La respuesta 403 de un perfil privado devuelve solo nombre y avatar para poder ofrecer «enviar solicitud». |
| **Una sola resolución de acceso** (`resolve()` en `routes/profiles.ts`) | self / friend / public / private se decide en un único sitio y lo usan perfil, lista y amigos. |
| **La pareja se guarda en la lista** (`user_a`, `user_b`) | «Vuestra lista» se encuentra aunque alguien haya salido. El límite de una por pareja es una constante (`maxListsPerPair`), no una restricción de BD, para poder admitir varias. |
| **Salir ≠ borrar** (`left_at`) | Quien sale pierde el acceso al contenido pero la lista se conserva; volver exige seguir siendo amigos. Solo la inactividad (60 días) la elimina. |
| **Actividad = cualquier cambio, no ver** | `record()` marca la actividad; así leer la lista no la mantiene viva eternamente. |
| **Borrado por inactividad con tarea propia** (`listLife.ts`) | Al arrancar y cada 6 h; `inactivityInfo()` calcula también el aviso de la app (45 días) sin depender de un correo. |
| **SMTP como base sin usar** | `mailer.ts` ya valida, evita inyección de cabeceras y cae a consola sin SMTP; conectarlo (12.12) es sustituir `deliverLink` y añadir el aviso de borrado. |
| **Flecha de tarjeta según pestaña** | En «Mi lista» avanza de fase solo donde hay fase siguiente (Por ver, Viendo); en la búsqueda sigue siendo «ver más adelante». |
| **Límite de espera por fuente** | TMDB es la fuente principal y a través del proxy corporativo la primera conexión puede tardar (6 s); Jikan es opcional y a menudo bloqueado (2 s). Un único límite daba avisos falsos sobre TMDB y retrasaba cada búsqueda. |
| **`JIKAN_ENABLED`** | Salida limpia para redes que bloquean Jikan: ni esperas ni avisos. |
| **Autocompletado retirado** | A petición del usuario; se mantiene la búsqueda mientras se escribe. Se eliminó el código, la ruta y los tests (no se deja código muerto). |
| **Revisionado con `prev_episodes` + `rewatch`** | Volver a ver algo finalizado lo pone en «Por ver» con los episodios a 0, pero las estadísticas se calculan como episodios actuales + de visionados anteriores, así que no se pierde nada. «Reviendo» no es un estado nuevo: es «Por ver» con `rewatch > 0` (la etiqueta se decide en el cliente). Borrar el contenido elimina la fila entera y con ella todo lo anterior. |
| **Borrado en bloque en el servidor** (`POST /api/library/delete`) | Una sola transacción para la selección múltiple, solo sobre filas propias; ids repetidos o inexistentes se ignoran. |
| **ConfirmDialog propio, no `window.confirm`** | Texto por tipo de contenido, foco inicial en «Cancelar», Escape/clic fuera cancelan y se puede probar en el navegador automatizado. |
| **Temblor respetando «reducir movimiento»** | Con `prefers-reduced-motion` se sustituye por un borde discontinuo. |
| **Fechas del roadmap por tarea** (`eta`, `etaNote`) | La fecha de tarjeta y columna se calcula (la de la última pendiente), así no hay datos duplicados que se desincronicen. Sin fecha + esfuerzo estimado cuando depende de algo externo. Al terminar una tarea se pone su fecha real. |
| **Plataforma de origen = fuente de los datos** (TMDB / MyAnimeList) | IMDb no es una fuente de datos aquí (solo puntuaciones vía OMDb en la ficha); mostrar IMDb como origen sería incorrecto. |
