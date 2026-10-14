# Changelog

Versiones 0.x según el roadmap: fase N completada = versión 0.(N+1).0.

## Fase 18 (en curso) · Descubrir y personalizar
- **Icono de la pestaña (18.1):** `favicon.svg` pasa a ser la «M» de Lock Block sola, más grande y sin ficha (se lee en pestañas claras y oscuras), y `favicon.ico` se regenera. Los enlaces llevan `?v=2` para que el navegador abandone el icono antiguo que tuviera en caché. Los iconos de la app instalada (PWA) conservan la ficha azul.
- **Lista infinita (18.2–18.7):** «Mi lista» y la lista de otros perfiles cargan **24 contenidos** y añaden 24 más al acercarse al final (con «Cargar más» como reserva). `GET /api/library` y `GET /api/profiles/:usuario/library` devuelven `{ items, nextCursor, total }` (+ `counts` en el primer lote); admiten `limit` (24 por defecto, máximo 60), `cursor`, `status`, `type`, `favorite` y `q`; los permisos del perfil no cambian. El **cursor** es de teclado (fecha + id), no un desplazamiento: editar una tarjeta mientras se cargan más no duplica ni salta nada. Los contadores de las pestañas son los reales (300) aunque solo haya 24 tarjetas; el filtro por título y el de tipo se hacen en el servidor y reinician la lista; la pestaña pulsada se centra en la tira desplazable.
- **Rendimiento medido** en Edge con un móvil emulado (390×780, CPU 4× más lenta) y 300 contenidos (`MOCK_SEED=300 npm run dev:mock -w server` crea el usuario «carga» / `Prueba-12345`): 13 peticiones de 24, sin duplicados, 7 MB de memoria JS, 22 ms por fotograma al desplazarse con las 300 cargadas. Dos medidas lo consiguen: `content-visibility: auto` en las tarjetas y `React.memo` (script 8,7 s → 0,7 s; maquetación 3,3 s → 0,7 s). Ver DECISIONES.
- 6 tests nuevos (`server/tests/library-page.test.ts`): lotes, orden, total, contadores, filtros, edición a mitad de la carga, validación del cursor y permisos del perfil.
- **Comparar perfiles (18.8–18.11):** dentro del perfil de otra persona (amigo o público) el menú lateral ofrece **«Comparar perfil»** (`/perfil/<usuario>/comparar`). La pantalla pone a «Tú» a la izquierda y a la otra persona a la derecha, con 10 estadísticas por fila (tiempo visto, episodios, terminadas en total y por tipo, viendo, por ver, dejadas y favoritas): **verde con ▲ para quien tiene más y rojo con ▼ para quien tiene menos**; en empate, gris. La señal no depende solo del color (triángulo dibujado en CSS y texto «más / menos / igual» para lectores de pantalla). API: `GET /api/profiles/:usuario/compare` (requiere sesión; mismas reglas de acceso que ver el perfil: privado → 403, uno mismo → 400, no expone correo ni datos privados). La lógica de comparación es una función pura (`server/src/compare.ts`). Sin sesión, la pantalla pide iniciar sesión.
- 6 tests nuevos (`server/tests/compare.test.ts`) y comprobación en navegador (menú, colores calculados, 390 px sin desbordes, sin sesión). El servidor simulado (`dev:mock`) no recarga solo: hay que reiniciarlo tras cambios del servidor.

## 1.0.0 · 2026-10-14 · Fase 17 · Versión móvil (PWA)
Primera versión estable: MAR se instala en Android e iPhone como PWA, con logotipo y favicon propios. Pendiente de ti (fuera de la 1.0): probar en móviles reales (17.19) y, si quieres, el APK (17.20).

- **Identidad visual (17.1–17.4):** logotipo propio «MAR» en SVG (`client/src/components/Logo.tsx`): letras de bloque gruesas y geométricas dibujadas desde cero sobre una cuadrícula de 40×50, inspiradas en el estilo de Lock Block pero sin copiar sus glifos (esa fuente es solo de uso personal). Es un trazado, no texto: no depende de ninguna fuente, hereda el color (`currentColor`) y lleva `aria-label="MAR"`. Sustituye al texto «MAR» en la cabecera de la app y en la de las páginas públicas.
- **Favicon:** `favicon.svg` (monograma «M» blanco sobre ficha azul, legible a 16 px) y `favicon.ico` con 16 y 32 px, enlazados en `index.html`.
- **App instalable (17.5–17.8):** iconos PNG generados desde el logotipo (`client/public/icons/`: 192 y 512 «any», 512 «maskable» con la M dentro de la zona segura y `apple-touch-icon` de 180, opaco); `manifest.webmanifest` (`standalone`, `lang: es`, colores `#0b0f1a`); `index.html` con enlace al manifiesto, `theme-color`, metaetiquetas de iOS (barra de estado opaca) y `viewport-fit=cover`. La CSP de `helmet` no necesita cambios (manifiesto e iconos caen en `'self'`). Test `server/tests/pwa.test.ts`: valida el manifiesto, el tamaño real de los PNG, el enlace en `index.html` y, con el cliente compilado, el tipo MIME `application/manifest+json`, los iconos y la CSP.
- **Service worker (17.9–17.12):** `client/public/sw.js` (a mano, sin dependencias: compatible con Node 16). Reglas: **`/api` nunca se intercepta ni se cachea** (datos personales y en vivo); las navegaciones van a la red y, si falla, muestran `offline.html`; los ficheros con hash de `/assets` se sirven primero de la caché (máximo 80); se precachean `offline.html`, el favicon y un icono. Las **carátulas de TMDB/MyAnimeList se dejan a la caché HTTP del navegador**: el service worker no puede pedirlas (la CSP `connect-src 'self'` lo impide) y una respuesta opaca ocuparía muchísimo en la cuota del navegador.
- **Sin conexión:** `offline.html` autocontenida (sin JavaScript, por la CSP) con el botón «Reintentar».
- **Versión nueva:** `vite.config.ts` sustituye `__BUILD__` por `versión-marcadeTiempo` en `dist/sw.js`, de modo que cada despliegue cambia el fichero. El cliente (`client/src/pwa/`) detecta el worker nuevo en espera, también al volver a abrir la app, y muestra «Hay una versión nueva · Actualizar»; al pulsar se activa y se recarga (solo entonces). Se borran las cachés de versiones antiguas.
- **Cabeceras de caché del servidor:** `/assets/*` → `immutable` (1 año); `index.html`, `sw.js`, `offline.html`, `manifest.webmanifest` y las rutas de la SPA → `no-cache`; el resto → 1 día.
- **Pruebas:** 11 tests nuevos en `server/tests/pwa.test.ts` (el service worker se ejecuta en un contexto simulado: no toca `/api`, muestra la página offline sin red, solo se activa a petición, limpia cachés antiguas; y las cabeceras reales). Además se probó en Edge real (`puppeteer-core`, fuera del repo): registro y control de la página, `/api` fuera de caché, página sin conexión, aviso de actualización y recarga. Esa prueba detectó un fallo real: el registro se hacía con el evento `load`, que ya había pasado cuando React ejecutaba el efecto; ahora se registra al momento si la página ya cargó.
- **Diseño móvil (17.13–17.17):** auditoría con Edge real (`puppeteer-core`, fuera del repo) en 390×780 de landing, acceso, registro, roadmap, inicio, Mi lista, amigos, listas, ajustes, perfil, ficha y menú; sin desbordes horizontales. Cambios: **zonas seguras** (`env(safe-area-inset-*)` en cabecera, contenido, menú lateral, pie y avisos), **altura dinámica** (`100dvh`; «Amigos» y «Listas» ya no tienen scroll de más), **objetivos táctiles de 44 px** (botones, pestañas, chips, iconos, botones de las tarjetas, papelera) solo con puntero táctil, **16 px en los campos** (evita el zoom de iOS), `touch-action: manipulation`, pestañas de «Mi lista» en una fila desplazable y etiqueta de la tarjeta que ya no se solapa con la papelera. El menú lateral se mantiene (ver DECISIONES). Sin dependencias del ratón: el temblor del modo «Eliminar» es una animación, y el historial ya mostraba sus botones en pantallas sin hover.
- **Rendimiento (17.17):** carga diferida de roadmap, ajustes, amigos, listas, perfiles públicos, invitaciones y lista compartida (`React.lazy`); el paquete inicial pasa de 248 a 217 kB (76,9 → 69,5 kB comprimido).
- **Pruebas automáticas (17.18):** `server/tests/pwa.test.ts` (manifiesto, iconos, service worker y cabeceras; 15 tests). Auditoría **Lighthouse 9** móvil de la pantalla de acceso (funciona con Node 16, fuera del repo): rendimiento 95, accesibilidad 100, buenas prácticas 100, PWA 100 y SEO 92 (faltaba un `robots.txt` válido: añadido, permite todo salvo `/api/`).
- **Roadmap con el logotipo (17.21):** arriba a la izquierda de `/roadmap`, el logotipo completo en lugar del texto «← MAR»; sigue llevando a la página de inicio.
- **Acceso sin scroll (17.22):** inicio, entrar, registro, «olvidé mi contraseña», restablecer y verificar ocupan justo la altura de la ventana en móvil (`100dvh`, contenido centrado, cabecera y pie compactos, atribución de TMDB incluida). Comprobado en 8 tamaños (320×568, 360×560, 360×640, 375×550, 375×667, 390×664, 390×780, 412×915) × 4 pantallas: ninguna tiene scroll. Solo si la ventana es diminuta aparece un desplazamiento interno para no ocultar contenido; en ≤ 400 px de ancho se oculta el enlace «Roadmap» de esa cabecera y en ≤ 600 px de alto, la versión del pie.
- **Logotipo con la letra de Lock Block (17.23–17.25):** el trazado propio se sustituye por los **glifos M, A y R reales de Lock Block** (Sronstudio), extraídos de la fuente con `opentype.js` y convertidos a SVG (`Logo.tsx`). La «M» del favicon, de `favicon.ico` y de los iconos de la PWA (192, 512, maskable y `apple-touch-icon`) es la M de esa fuente. **Licencia:** la descarga de dafont es una demo de **uso personal**; MAR es personal y gratuita, pero si algún día tuviera uso comercial habría que comprarla o cambiar el logotipo (el diseño propio anterior sigue en el historial de git). El fichero de la fuente no se sube al repo. Detalle en `docs/THIRD_PARTY_LICENSES.md`.

## Despliegue · 2026-10-14 · Fly.io
- **App publicada en https://mar.fly.dev (5.1, 5.3, 5.8):** Fly.io, región París (`cdg`; Madrid ya no existe), una máquina `shared-cpu-1x` de 512 MB siempre encendida y volumen cifrado de 1 GB en `/data` con copias diarias. Configuración en `fly.toml`.
- Secretos en Fly (`JWT_SECRET` nuevo y distinto del local, `PUBLIC_URL`, `CLIENT_ORIGIN`, claves de TMDB y OMDb). La BD de producción empieza vacía.
- `flyctl` portable en `tools/fly.exe` (sin administrador). Pasos y trampas en `docs/DESPLIEGUE.md`.
- Correo (12.10, 12.12): en espera por decisión del usuario.

## 0.17.0 · 2026-10-13 · Fase 16 · Ficha y botones
- **Botón «Eliminar» en la ficha (16.1–16.3):** al final de la fila de estados (Por ver · Viendo · Finalizado · Dejado · **Eliminar**). Solo se activa cuando el contenido está en tu lista, en cualquiera de los estados; si no, aparece desactivado con la ayuda «Solo disponible cuando lo tienes en tu lista». Pide confirmación con el texto según el tipo («¿Estás seguro de borrar permanentemente esta película de tu lista?») y, al confirmar, se restan sus episodios y minutos del perfil y los estados quedan sin marcar.
- **Botones de la búsqueda (16.4–16.6):** el icono de lista ya no tiene lápiz (portapapeles con lista), la marca ✔ queda centrada (medido: desvío < 0,2 px) y los tres botones son **semitransparentes** (opacidad ≈ 0,5–0,6), dejando ver la carátula; el activo se refuerza con un aro blanco y más color.
- **Iconos de línea (16.7–16.9):** los «emojis» de la interfaz (botones de la búsqueda, menú, aviso de revisionado y fechas del roadmap) pasan a ser **iconos de contorno blanco y transparentes por dentro** con **Lucide** (`lucide-react` 0.469.0, licencia ISC; solo se incluyen los 8 necesarios). Se probó antes Twemoji (SVG de color) pero se descartó por ser figuras rellenas. Componente: `client/src/components/Emoji.tsx`. Licencia en `docs/THIRD_PARTY_LICENSES.md`.

## 0.16.0 · 2026-10-13 · Fase 15 · Botones de la búsqueda
- Las tarjetas de la búsqueda (y las de la portada con las tendencias) cambian sus botones por **tres botones de estado**: **lista** a la izquierda (añadir a «Por ver»; vuelve a pulsarlo para quitarlo), **ojo** en el centro con fondo **verde** («Viendo») y **marca ✔** a la derecha con fondo **morado** («Finalizado»: marca todos los episodios como vistos). El emoji de la marca de verificación va sin fondo propio (en blanco sobre el morado). El estado activo se señala con un aro blanco y `aria-pressed`.
- **El corazón sale de la búsqueda.** Sigue disponible en la ficha del contenido y en las tarjetas de «Mi lista», que conservan ♥ y la flecha de avanzar de fase / volver a ver.
- Solo cliente; sin cambios en la API (usa `/status` y `/later`).

## 0.15.0 · 2026-10-13 · Fase 14 · Menú, búsqueda y gestión de la lista
- **Roadmap con fechas (14.16, 14.17) — prioridad alta:** cada tarea, cada tarjeta y cada columna indican cuándo estará lista: **«Hecho el 13 oct»** (fecha real), **«Listo hoy»** / **«Listo ~ 15 oct»** (estimada), **«Retrasado (previsto …)»** si se pasa, y **«Sin fecha»** cuando depende de algo externo (con el motivo y el esfuerzo estimado al pasar el ratón o debajo). La fecha de una tarjeta o columna es la de su última tarea pendiente (o la de la última terminada si está todo hecho). Datos: campos `eta` y `etaNote` de cada tarea en `roadmap.json`.
- **Búsqueda (14.1, 14.2):** se **retira el autocompletado** (desplegable de sugerencias, su ruta `/api/search/suggest` y sus tests); los contenidos siguen apareciendo mientras se escribe. Tras el año y la categoría se muestra la **plataforma de origen** (TMDB, MyAnimeList). Nota: IMDb y Rotten Tomatoes son solo las puntuaciones de la ficha; los datos de series y películas vienen de TMDB.
- **Menú (14.3–14.6):** jerarquía con «Inicio» arriba; las entradas «Mi…» una tabulación a la derecha como subsección; «Mis listas conjuntas» justo debajo de «Mi lista» y otra tabulación más; «Ajustes» al nivel de «Inicio». Se mantienen los iconos de la casa y el engranaje y se añaden 📝 Mi lista, 🗂️ Mis listas conjuntas y 👥 Mis amigos. Desaparece la fila inferior «Inicio / Ajustes».
- **Revisionado (14.7–14.9):** la flecha de las tarjetas «Finalizado» las devuelve a «Por ver» con los episodios a 0 (`POST /api/library/:id/rewatch`). Se muestran como **«Reviendo»** (tarjeta y ficha, con nota del n.º de visionado). Los episodios del visionado terminado se guardan aparte (`prev_episodes`, migración 9) y **siguen contando** en episodios, minutos y «Terminadas» del perfil; si se vuelve a finalizar, cuentan dos veces.
- **Borrar contenidos de «Mi lista» (14.10–14.15):** papelera arriba a la derecha de cada tarjeta con confirmación («¿Estás seguro de borrar permanentemente esta serie de tu lista?», según sea serie, película o anime). Botón rojo **«Eliminar»** a la derecha de los filtros: las tarjetas tiemblan (se respeta «reducir movimiento»), desaparecen favorito, flecha y papelera, un clic las selecciona y **«Confirmar borrado»** abre una segunda confirmación. Borrado en bloque en una sola operación (`POST /api/library/delete`). Borrar un contenido resta sus episodios y minutos (también los de visionados anteriores); quitar episodios a mano también resta.
- Quitar «ver más adelante» durante un revisionado ya no borra la fila (se perderían los visionados anteriores).
- 146 tests (nuevos: revisionado, estadísticas, borrado individual y en bloque) y prueba end-to-end en navegador de todo lo anterior.

## 0.14.0 · 2026-10-13 · Fase 13 · Búsqueda robusta
Motivo: aparecían los avisos «TMDB está tardando» y «MyAnimeList (Jikan) está tardando». Se midió en la red corporativa: Jikan no responde nunca (bloqueado) y el límite único de 3,5 s también cortaba a TMDB, que en una conexión fría a través del proxy puede tardar más. Además cada búsqueda con «Todo» esperaba 3,5 s mientras no actuaba el corte.
- **13.1** Límite de espera por fuente: TMDB 6 s (`TMDB_SOFT_MS`), Jikan 2 s (`JIKAN_SOFT_MS`); sustituye al único `SEARCH_SOFT_MS`.
- **13.2** El corte automático ahora tiene **retroceso progresivo**: 1 min tras el primer fallo, el doble con cada fallo seguido hasta 15 min (`PROVIDER_DOWN_MS`, `PROVIDER_DOWN_MAX_MS`), y se reinicia en cuanto la fuente responde. Antes se volvía a probar (y a esperar) cada minuto. Medido: de 3,5 s por búsqueda a ~150 ms tras las 2 primeras.
- **13.3** `JIKAN_ENABLED=false` desactiva Jikan por completo: «Todo» no espera ni avisa; en «Anime» y en la portada de anime se indica que está desactivado; `/api/search/status` lo refleja.
- **13.4** Avisos más claros: «tarda más de lo normal» (la respuesta llegará en la siguiente búsqueda) y «no responde ahora mismo (¿red bloqueada?); se omite un rato y se volverá a probar solo».
- 133 tests (nuevos: corte progresivo, tope, reinicio, errores de API que no cortan, interruptor de Jikan).

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
