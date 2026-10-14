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
| **Botones de estado en la búsqueda (📝 👁️ ✔️)** | Sustituyen a ♥ y ↪ solo en las tarjetas de búsqueda y portada. 👁️ y ✔️ fijan el estado (no son interruptores: deshacer es desde «Mi lista» o la ficha); 📝 sigue siendo un interruptor como el antiguo «ver más adelante». ✔️ usa el mismo cálculo que «Finalizado» en la ficha (marca todos los episodios). |
| **Iconos de línea con Lucide en lugar de emojis** | Se pidió contorno blanco y transparente por dentro. Los emojis del sistema (y los de color como Twemoji, que se probó primero) son figuras rellenas y distintas en cada equipo. `lucide-react` (ISC) da SVG con trazo `currentColor` y sin relleno, se importan solo 8 iconos y se centran en su caja (medido). |
| **Botón «Eliminar» de la ficha dentro del selector de estados** | Es el último elemento de la fila; `canDelete = hay estado`, así se activa en los cuatro estados y se desactiva cuando no está en la lista. Reutiliza `DELETE /api/library/:id` y el `ConfirmDialog`. |

## Móvil y PWA (fase 17)

| Decisión | Motivo |
|---|---|
| **PWA en vez de Capacitor o app nativa** | El funcionamiento es el mismo y sirve para Android e iPhone con una sola base de código. En iPhone no se puede instalar un `.ipa` sin cuenta de desarrollador de pago (99 USD/año) ni sin un Mac; la PWA se instala desde Safari. |
| **Service worker escrito a mano** (sin `vite-plugin-pwa`) | Pocas reglas y sin dependencias nuevas compatibles con Node 16. Se sella con un identificador por compilación (`vite.config.ts`) para detectar versiones nuevas. |
| **`/api` nunca pasa por el service worker** | Son datos personales y en vivo: cachearlos mostraría listas viejas o de otra sesión. |
| **Carátulas fuera del service worker** | Su CSP (`connect-src 'self'`) no le deja pedirlas y las respuestas opacas ocupan mucha cuota. Las cachea el navegador con las cabeceras de TMDB. |
| **Se mantiene el menú lateral (no barra inferior)** | Ya es el patrón móvil habitual (botón ☰ y panel), la jerarquía «Inicio → Mi… → Mis listas conjuntas» cabe mejor en un panel que en 4–5 iconos, y evita reescribir la navegación. |
| **Objetivos táctiles de 44 px solo con `pointer: coarse`** | En ordenador la interfaz no cambia; en móvil se cumple la recomendación de Apple/Google. Los campos usan 16 px para que iOS no haga zoom al enfocar. |
| **Pestañas de «Mi lista» en una fila con desplazamiento** | Ocupaban tres filas en 390 px. |
| **Carga diferida de pantallas poco frecuentes** | El paquete inicial baja de 248 a 217 kB (de 76,9 a 69,5 kB comprimido). |

## Lista infinita (fase 18)

| Decisión | Motivo |
|---|---|
| **Paginación en el servidor, no solo en el cliente** | Con miles de contenidos no se envían ni se parsean todos de golpe: el primer lote (24) llega al instante y el JSON es pequeño. |
| **Cursor de teclado (`updated_at` + `id`) en lugar de `OFFSET`** | Si se cambia una tarjeta ya cargada mientras se piden más (sube al principio del orden), un desplazamiento duplicaría o saltaría contenidos; con cursor, los lotes siguientes continúan donde estaban. Se comprueba en `library-page.test.ts`. |
| **Los contadores de las pestañas vienen del servidor (solo en el primer lote)** | Ya no se pueden contar sobre lo cargado: «Todos 300» debe verse con 24 tarjetas en pantalla. Tras cambiar o borrar se refrescan con `?limit=1`. |
| **`IntersectionObserver` con 600 px de margen y botón «Cargar más» de reserva** | Se piden más antes de llegar al final, sin escuchar el evento `scroll` (que castiga a los móviles lentos). El observador se recrea tras cada lote para encadenar lotes en pantallas altas. |
| **Sin virtualización completa (ventanas con `react-window`)** | Es más código y más frágil (tarjetas de altura variable, selección múltiple, foco y lectores de pantalla). Se consigue casi lo mismo con `content-visibility: auto` (el navegador no maqueta ni pinta lo que no se ve) y tarjetas memoizadas. Límite conocido: con ~1000+ contenidos el DOM supera los 20 000 nodos; si llegara el caso, se añadiría ventana. |
| **Tarjetas con `React.memo` y callbacks estables** | Sin ello cada lote repintaba todas las tarjetas ya cargadas (coste cuadrático): con 300 contenidos y la CPU 4× más lenta, el script pasó de 8,7 s a 0,7 s y la maquetación de 3,3 s a 0,7 s. |

## Tema claro y oscuro (fase 18)

| Decisión | Motivo |
|---|---|
| **Variables CSS y `data-theme` en `<html>`** | Los colores ya eran variables (`--bg`, `--panel`, `--accent`…): el tema claro es un bloque `:root[data-theme="light"]` que las redefine. Sin librerías ni clases por componente. El oscuro sigue siendo el valor por defecto (sin atributo). |
| **`--on-accent` en lugar de `#06121f` fijo** | El texto sobre fondos de color (botón principal, estados) es oscuro en el tema oscuro y blanco en el claro, donde esos colores son más oscuros. |
| **Script externo `theme-init.js` en la cabecera** | La CSP prohíbe scripts en línea, y aplicar el tema desde React provocaría un parpadeo blanco. Un script mínimo y bloqueante lo fija antes de pintar. |
| **Doble almacenamiento: navegador y cuenta** | Antes de iniciar sesión solo existe `localStorage`. Con sesión, la preferencia vive en `users.theme` (migración 10) y manda al iniciar sesión en otro dispositivo. Una cuenta nueva nace con el tema que el visitante ya usaba (`theme` opcional en el registro). |
| **Interruptor `role="switch"` con luna y sol de contorno blanco** | Accesible (estado en `aria-checked`) y legible en los dos temas, porque el fondo del interruptor es de color en ambos (`--switch-track`). |
| **Paleta clara comprobada con un medidor de contraste WCAG** | En el navegador se midió cada texto visible en 5 pantallas y 2 temas: todo ≥ 4,5 (3 en texto grande). Salieron 4 pares justo por debajo y se ajustaron (`--accent`, `--done`, `--todo`, texto de `.seg-btn.on`). |
| **Los botones sobre carátulas no cambian de tema** | Van sobre imágenes, así que siguen siendo oscuros translúcidos con iconos blancos en ambos temas. |

## Recomendaciones (fase 18)

**¿Lo da ya TMDB?** TMDB solo ofrece «similares» y «recomendados» *de un título concreto*, no «según todo lo que ha visto esta persona»; y esa lista se basa en sus usuarios, no en los tuyos. Por eso la afinidad se calcula aquí y TMDB se usa para (a) saber a qué géneros pertenece cada título, (b) medir cuánto pesa cada género en el mercado y (c) descubrir títulos candidatos por género (`/discover`).

**Fórmula** (`server/src/domain/recommend.ts`, reglas puras y con tests):

1. **Peso de cada contenido** = peso del estado × 2 si es favorito. «Vista» vale 1: Finalizado 1 · Viendo 0,8 · Por ver 0,4 · Dejado 0,15.
2. **Presencia propia** del género = suma de pesos de tus contenidos de ese género ÷ suma total de pesos.
3. **Presencia en el mercado** = qué parte de los ~60 títulos más populares de TMDB (series o películas) tienen ese género; se calcula una vez al día. Mínimo 0,03 para que un género casi inexistente no dispare la cuenta.
4. **Lift** = presencia propia suavizada ÷ presencia en el mercado. La suavización `(peso + 3·mercado) / (total + 3)` acerca el resultado a la media del mercado cuando hay pocos datos (con un solo contenido no se concluye que «le encanta» ese género).
5. **Puntuación del género** = `log2(1 + lift) × log2(1 + peso)`. El primer factor corrige el efecto «hay más Drama que Terror»; el segundo premia la cantidad (con rendimientos decrecientes).
6. Se toman los **3 géneros con más puntuación**, se piden a TMDB títulos de cada uno (nota ≥ 6,5 y ≥ 200 votos), se **excluye lo que ya tienes** y se ordenan por `suma de afinidad de sus géneros × (0,6 + 0,4 × calidad)`, con la popularidad como desempate. Cada recomendación indica el género que la motiva.

| Decisión | Motivo |
|---|---|
| **Géneros guardados en `content.genres` (migración 11)** | Se rellenan al buscar (TMDB los da en los resultados) y al abrir la ficha; lo guardado antes se completa de 8 en 8 en cada petición, sin bloquear. |
| **Series y películas comparten gustos** | Los catálogos de TMDB difieren (p. ej. «Acción y Aventura» de las series ↔ «Acción» + «Aventura» de las películas); `mapGenres` traduce los que equivalen y conserva los que coinciden. |
| **Anime queda fuera por ahora** | Jikan no aporta géneros en nuestra consulta y no responde desde la red de desarrollo. |
| **Cuota de mercado cacheada 24 h; consultas por género 6 h** | Pocas peticiones a TMDB (3 + 3 por usuario y día como mucho). |
| **El endpoint devuelve también los géneros y sus números** | Para poder explicar y depurar de dónde salen las recomendaciones. |

## Búsqueda avanzada (fase 18)

| Decisión | Motivo |
|---|---|
| **`/discover` de TMDB con filtros en la propia API** | TMDB ya filtra por plataforma (`with_watch_providers` + `watch_region`), género, productora, fechas y nota; no hay que traer todo y filtrar aquí. |
| **Región de las plataformas configurable (`TMDB_REGION`, `ES` por defecto)** | La disponibilidad en Netflix, HBO… cambia por país. |
| **Filtros en la URL (`useSearchParams`)** | Se comparten, funcionan con «atrás» y sobreviven a una recarga; no hay estado oculto. |
| **Solo series y películas** | Jikan (anime) no ofrece plataformas, estudios por id ni filtros equivalentes de forma fiable. |
| **Nota mínima ⇒ ≥ 150 votos** | Sin un mínimo de votos, ordenar por nota devuelve títulos desconocidos con un único 10. |
| **Años se aplican al escribir 4 cifras válidas, nunca inválidos** | Evita peticiones con 1, 2 o 3 cifras mientras se teclea y deja el error visible sin tocar el servidor. |

## Temporadas (fase 19)

| Decisión | Motivo |
|---|---|
| **El progreso sigue siendo un número de episodios vistos** | El contador, las estadísticas, el revisionado y las listas conjuntas ya se basan en él. Las temporadas son una **vista** sobre ese número: los episodios se marcan por orden hasta el visto, y pulsar uno lo fija (pulsar el último visto lo desmarca). No hay un registro por episodio, así que no se puede «saltar» uno. |
| **Estructura en `content.seasons` (migración 12), tomada de TMDB** | `/tv/{id}` ya devuelve las temporadas y sus episodios. Se guardan sin los especiales (temporada 0) y las series guardadas antes se completan al abrir su ficha. |
| **`normalizeSeasons`: la suma debe coincidir con el total** | TMDB a veces no cuadra (episodios de más o de menos). El total es lo que cuenta el progreso: si sobran, se recortan los últimos; si faltan, se añaden a la última temporada. |
| **Anime y series sin datos: una sola sección «Episodios»** | Jikan no aporta temporadas; es mejor una lista única que inventarlas. |
| **«Temporadas vistas» = temporadas completas** | Se cuenta una temporada cuando todos sus episodios están vistos. En un revisionado se usa el mayor entre el visionado actual y los anteriores (ya se vio todo una vez), no se suman dos veces. Sin estructura, una serie o anime terminado cuenta como 1; las películas, 0. |
| **Temporadas plegables, abierta la que toca ver** | Series largas tienen cientos de episodios: solo se pintan los botones de las secciones abiertas. |

## Documentación (fase 20)

| Decisión | Motivo |
|---|---|
| **README orientado a GitHub y en tercera persona** | Quien llega al repositorio debe entender qué es MAR, verlo y ponerlo en marcha sin conocer su historia. Lo personal o específico de un equipo (rutas, red, permisos) no se publica: vive en notas locales no versionadas. |
| **El detalle pasa a `docs/`** | README breve y con enlaces; arquitectura, API, desarrollo y despliegue en documentos propios que se pueden mantener por separado. |
| **Capturas con un modo demo del servidor simulado** | Reproducibles (`scripts/capturas.js`), sin datos reales ni imágenes con derechos de autor: las carátulas son SVG generadas a partir del título. |
| **Insignia de versión leída de `package.json`** | El README no se desactualiza en cada publicación. |
| **Documentos de origen en `docs/historico/`** | El encargo inicial y el borrador de roadmap se conservan como contexto, claramente separados de la documentación vigente. |

## Notificaciones de novedades (fase 22)

| Decisión | Motivo |
|---|---|
| **La petición de la campana nunca espera a TMDB** | Pedir las novedades de cientos de contenidos tarda segundos. La API solo lee de la base de datos y vuelve al instante; el cálculo va en segundo plano y el cliente vuelve a preguntar (2,5 s, 5 s…, luego cada 5 min y al volver a la pestaña). |
| **Cola global con límite de concurrencia (3) y rondas de 30 contenidos** | Acota la carga sobre TMDB y sobre el proceso (la base de datos es de un solo hilo): entre contenido y contenido se cede el turno al resto de peticiones. El hueco del limitador se traspasa al siguiente en espera para que nadie se cuele y se supere el límite (hubo una carrera que lo permitía; ahora hay una prueba). |
| **Instantánea de novedades por contenido, compartida** | Si varias personas tienen la misma serie, TMDB se consulta una vez. Lo individual (qué es novedad para cada una) se decide comparando con su «base». |
| **Caducidades según el tipo** | Una serie terminada o una película casi nunca cambian (7 días); una serie en emisión sí (12 h). Reduce las peticiones en un orden de magnitud. Las películas relacionadas (una petición extra de búsqueda) se revisan cada 7 días. |
| **Base de comparación al empezar a seguir** | Sin ella, la primera vez saldrían avisos de todo lo que ya existía. Solo lo posterior a haber añadido el contenido es novedad. |
| **Clave única por novedad (`dedupe_key`)** | Recalcular no duplica avisos. «Anunciada» y «disponible» son dos avisos distintos de la misma temporada (primero se anuncia, luego se estrena). |
| **Películas relacionadas por título (heurística)** | TMDB no enlaza series con sus películas ni spin-offs. Se busca una película cuyo título contenga el de la serie como palabras completas, no sea anterior a la serie y no sea un documental ni un «making of». Puede haber falsos positivos (otra obra con el mismo nombre): solo generan un aviso que se puede ignorar. Para películas se usa la **colección** de TMDB (sagas), que sí es fiable. |
| **«Solo favoritos» se aplica al leer** | Activarlo o quitarlo es inmediato y no obliga a recalcular ni a perder avisos. |
| **Los avisos llevan a la ficha y no hacen nada más** | Es la persona quien decide qué hacer (añadir, marcar…). Si el aviso es de una película relacionada, lleva a la película (que se guarda como contenido, sin pedir más datos). |
| **Ventana inicial con elección** | La primera vez que se abre la campana se explica el ajuste y se pide elegir entre todos y solo favoritos; se guarda en la cuenta y no vuelve a salir. |
| **Panel y ventana en un portal** | La cabecera usa `backdrop-filter`, que convierte a la cabecera en el bloque contenedor de todo lo «fixed» de su interior y lo recortaría. |
