# Changelog

Versiones 0.x según el roadmap: fase N completada = versión 0.(N+1).0.

## 0.13.0 · 2026-10-13 · Fase 12 · Vuestra lista
- **«Vuestra lista» (12.1–12.3):** nueva entrada en el menú del perfil de un amigo. Si la pareja ya tiene lista conjunta, se abre directamente; si no, pantalla «Aún no tenéis una lista conjunta» / «Crea una lista conjunta e invita a tu amigo» con el botón **«Crear nueva lista conjunta»**, que la crea al instante (nombre por defecto «Lista de X y Y») y la otra persona la ve sin aceptar nada.
- **Listas por pareja (12.4–12.6):** una lista por pareja por ahora (`maxListsPerPair`, el modelo admite varias); la pareja se guarda aparte de los miembros. Cada persona puede **salir** de la lista sin borrarla (`left_at`), verla en «Listas que has dejado» y **volver a unirse** mientras sigan siendo amigas. Si salen las dos, la lista se conserva.
- **Inactividad (12.7, 12.8, 12.11):** se registra la última actividad (crear, añadir, quitar, estado, episodios, rollback, unirse, salir; ver no cuenta). Tras **2 meses** sin actividad la lista se borra con todo su contenido e historial (tarea al arrancar y cada 6 h, `server/src/listLife.ts`). Los 15 días previos se avisa **dentro de la app** (banner en la lista e insignia «Se borrará en N días»). Plazos configurables: `JOINT_INACTIVITY_DAYS`, `JOINT_WARNING_DAYS`.
- **Base del SMTP (12.9):** `server/src/mailer.ts` (nodemailer) con configuración `SMTP_*` / `MAIL_FROM`, validación del destinatario y protección contra inyección de cabeceras; sin SMTP escribe el correo en la consola. **No se usa todavía** (prioridad baja): recuperar contraseña y verificar correo siguen mostrando el enlace en consola. Comando de comprobación: `npm run mail:test -w server -- tu@correo.com`.
- Pendiente (prioridad baja): aviso por correo antes del borrado (12.10) y conectar el envío real (12.12).
- Migración 8 con relleno de las listas existentes (pareja y última actividad). 124 tests en total.

## 0.12.0 · 2026-10-13 · Fase 11 · Perfiles con URL propia
- **URL única por perfil (11.1–11.4):** `/perfil/<usuario>` (con subpáginas `/lista` y `/amigos`) sustituye a `/friend/<número>`. Botón «Copiar URL del perfil». Las direcciones antiguas (`/friend/<id>[/list|/friends]`, `/profile`, `/u/<token>`) redirigen.
- **Visibilidad (11.5–11.8):** cada perfil es **solo para amigos (por defecto)** o **público** (cualquiera, también sin cuenta, solo lectura); opción de mostrar la lista en el perfil público (los amigos de una persona nunca son públicos). Un perfil privado visto por otra persona muestra un aviso y permite **enviar solicitud** (o iniciar sesión / registrarse si no hay sesión). Se muestra la visibilidad en el perfil propio.
- API nueva `/api/profiles/<usuario>[/library|/friends]` (sustituye a `/api/users/:id/*`) y `PUT /api/me/visibility`; el antiguo enlace con token pasó a ser solo una redirección. El enlace de solicitud (nombre en el menú) también sirve para perfiles públicos.
- Migración 7: quien ya compartía su perfil pasa a público.

## 0.11.0 · 2026-10-13 · Fase 10 · Menú y listas
- **Menú (10.1, 10.2):** «Inicio» pasa a la parte baja, en la misma fila que «Ajustes» y diferenciado del resto de entradas; «Listas conjuntas» pasa a **«Mis listas conjuntas»** (menú y títulos).
- **Tarjetas de «Mi lista» (10.3, 10.4):** la flecha (abajo a la derecha) **pasa el contenido a la siguiente fase** (Por ver → Viendo → Finalizado; al finalizar se marcan todos los episodios) y solo aparece en las pestañas «Por ver» y «Viendo». En «Todos», «Favoritos», «Finalizado» y «Dejado» no se muestra. En la búsqueda sigue siendo «ver más adelante».

## 0.10.0 · 2026-10-13 · Fase 9 · Mejoras
- **Foto de perfil desde el menú (9.1):** al pulsar la imagen del menú lateral se abre una ventana con la foto actual y opción de actualizarla (recorte circular) o quitarla. En el perfil de un amigo solo se ve.
- **Enlaces de amistad (9.2–9.5):** al pulsar tu nombre en el menú se copia un enlace (`/invite/<token>`); quien lo abra con su cuenta te añade como amigo directamente. Desde el perfil de un amigo, el mismo gesto copia un enlace que **envía una solicitud** a esa persona (no la añade). Sin sesión se muestra una pantalla que exige iniciar sesión o registrarse y, tras hacerlo, se vuelve al enlace (`?next=`). Cada enlace queda guardado con quién lo generó (tabla `invite_links`) y se puede renovar en Ajustes. Si el navegador no permite el portapapeles (p. ej. `http://IP`), se usa una alternativa.
- **Búsqueda al escribir (9.6, 9.9):** resultados mientras se escribe (espera de 300 ms, cancelando las peticiones anteriores). Muestra el tiempo del servidor y el total para evaluar la velocidad. Interruptor `LIVE_SEARCH` en `client/src/config.ts` para volver a buscar solo con Enter.
- **Sugerencias (9.7):** lista desplegable con teclado (↑ ↓ Enter Esc) y la parte escrita resaltada.
- **Pantalla inicial (9.8):** series más vistas del momento (TMDB, tendencia semanal); según el filtro, películas o anime (Jikan). Sin clave de TMDB cae en anime.
- **Rendimiento:** caché en memoria para las búsquedas (sin escribir en la BD en cada pulsación) con peticiones simultáneas compartidas; no se vuelven a guardar contenidos ya completos; un proveedor lento no retrasa más de 3,5 s la respuesta (se avisa y se completa en la siguiente).
- **Pulido (9.10):** separación del aviso de «Sus amigos» respecto a la lista.
- 98 tests (nuevos: sugerencias, tendencias, límite de espera, enlaces de amistad) y prueba end-to-end en navegador de todo el flujo.
- Roadmap: planificados los perfiles con URL propia y «Vuestra lista» (tras añadir la fase 10 quedaron como fases 11 y 12).

## 0.9.0 · 2026-10-13 · Fases 1 a 8
### Fase 1 · Cuentas (0.2.0)
- Base de datos SQLite con `sql.js` (WASM, sin compilar nada nativo), migraciones versionadas en `server/src/migrations.ts` y volcado a `data/mar.db`.
- Registro, login y logout (bcryptjs + JWT en cookie httpOnly, sameSite). Validación con zod en el servidor. Login por usuario o correo; mensaje genérico ante error para no revelar cuentas.
- Seguridad básica: helmet (CSP incluida), límite de intentos en auth, CORS restringido, `.gitignore` de `.env` y BD.
- Pantalla inicial pública con "Iniciar sesión" y "Registrarse" arriba a la derecha; contraseña ofuscada con botón Ver/Ocultar.
- Layout con menú lateral (avatar redondo + nombre + Inicio, Mi perfil, Mi lista, Mis amigos, Listas conjuntas, Ajustes): abierto por defecto en escritorio, cajón en móvil.

### Fase 2 · Búsqueda (0.3.0)
- Proveedores TMDB (series y películas), Jikan (anime, con límite de ~3 peticiones/s) y OMDb, todos desde el servidor, con **caché persistente** en BD y reutilización de datos caducados si el proveedor falla.
- Buscador único con filtro por tipo; resultados entrelazados; las series de animación japonesa de TMDB se descartan (las cubre Jikan).
- Tarjetas con ♥ (favorito → pasa a Finalizado con todos los episodios; máximo 10, error claro al 11º) y ↪ (ver más adelante, alterna).
- Avisos si falta una clave o un proveedor falla; la app arranca sin claves. Atribución a TMDB en el pie.

### Fase 3 · Contenido (0.4.0)
- Ficha: sinopsis, episodios, estudio, puntuaciones IMDb + Rotten Tomatoes (OMDb, RT puede faltar) y MyAnimeList.
- Estados Por ver / Viendo / Finalizado / Dejado; contador − / + y edición manual solo numérica; superar el total fija el máximo y finaliza.
- Mi lista con pestañas por estado, favoritos, filtro por tipo y por título.

### Fase 4 · Perfil (0.5.0)
- Horas totales (duración fija 50/90/23 min por tipo) y formato escalonado horas → días → semanas → meses → años (con tests).
- Contadores por estado, terminadas por tipo, top 10 de favoritas, avatar con recorte circular (arrastrar y zoom).
- 4.6: `USE_REAL_RUNTIME=true` usa la duración media real de TMDB/Jikan (desactivado por defecto).

### Fase 5 · Despliegue y compartir (0.6.0)
- Perfil público `/u/<token>` de solo lectura (desactivado por defecto, opcionalmente con la lista, token revocable).
- Exportar datos en JSON. `Dockerfile`, `render.yaml` y `docs/DESPLIEGUE.md`. **Falta publicar** (necesita cuenta de hosting); la imagen Docker no se pudo construir aquí (motor no iniciado).
- Producción: cookie `Secure` solo con HTTPS, `JWT_SECRET` obligatorio.

### Fase 6 · Amigos (0.7.0)
- Solicitudes (con aceptación automática si ya te habían enviado una), tarjetas de amigos, y perfil / lista / amigos del amigo con menú "Su perfil / Su lista / Sus amigos". Solo se ven perfiles de amigos.

### Fase 7 · Listas conjuntas (0.8.0)
- Lista entre dos amigos, editable por ambos. Historial por modificación (quién, qué, cuándo) y **Rollback** que restaura el estado de ese punto y queda registrado. Límite configurable (50 por defecto, mínimo 15).

### Fase 8 · Opcionales (0.9.0)
- Recuperar contraseña y verificar correo (el "correo" es un enlace en la consola del servidor hasta configurar un servicio de envío).
- Buzón de ideas en `/roadmap`, solo desde localhost.

### Otros
- **Probado con las APIs reales** (TMDB con token v4 y OMDb): búsqueda en español, ficha (62 episodios, IMDb 9,5, Rotten Tomatoes 96 %), favorito y perfil correctos.
- Red corporativa con inspección HTTPS: `scripts/ca.js` pasa `certs/corporate-ca.pem` a Node (`NODE_EXTRA_CA_CERTS`) en `dev` y `share`.
- Corte automático de proveedores caídos (60 s) y timeout de Jikan de 5 s: una API bloqueada ya no ralentiza cada búsqueda (de ~16 s a ~0,5 s).
- `npm run share` (5.7): túnel temporal de Cloudflare (`tools/cloudflared`) hacia el servidor de desarrollo (:3001, que sirve `client/dist`) para probar desde otras máquinas mientras se pospone el hosting. **Una sola base de datos** (`data/mar.db`). Se niega a abrir el túnel si el servidor usa el `JWT_SECRET` por defecto (`/api/health` informa `devSecret` fuera de producción). `trust proxy = loopback` en local para cookie `Secure` e IP real tras el túnel.
- Limpieza: cuenta `prueba` duplicada (existía en la base de desarrollo y en la que usaba el modo compartido, entonces separada) eliminada de la base compartida; unificadas las bases. 82 tests.
- 80 tests (Vitest): dominio y API completa contra proveedores simulados. Prueba end-to-end en navegador (Edge) del flujo completo.
- Roadmap: versiones por fase y buzón de ideas.

## 0.1.0 · 2026-10-13 · Fase 0 · Base y roadmap
- Monorepo con npm workspaces (`client`, `server`) compatible con Node 16.20.2.
- Servidor Express con `GET /api/health` y `GET /api/roadmap`.
- Página de roadmap pública y de solo lectura (columnas por fase, tarjetas, filtro, progreso) con refresco automático por polling cada 4 s.
- `npm run dev` levanta cliente y servidor e imprime las URLs. `.env.example`, `.gitignore`, README y documentación inicial.
