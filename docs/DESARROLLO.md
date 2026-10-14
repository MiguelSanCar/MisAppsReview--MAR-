# Guía de desarrollo

Cómo trabajar en MAR: puesta en marcha, scripts, pruebas, entorno simulado, convenciones y solución de problemas.

## Requisitos

- **Node.js 16.20.x** y npm 8. Las dependencias están fijadas para esta versión (Vite 4, Vitest 0.34, `ts-node-dev`); no se usa nada que exija Node 18+ (ni `tsx`, ni `fetch` global: las llamadas HTTP salientes usan `getJson` de `server/src/http.ts`).
- No hay dependencias nativas que compilar (SQLite se ejecuta con `sql.js`, WebAssembly).
- Desarrollo habitual en Windows; la imagen de producción es Linux (Alpine).

## Puesta en marcha

```bash
npm install                   # cliente y servidor (npm workspaces)
cp .env.example .env          # y rellenar las claves (ver más abajo)
npm run dev                   # API :3001 + Vite :5173 con proxy /api
```

| URL | Qué |
|---|---|
| http://localhost:5173/ | Aplicación (Vite, recarga en caliente) |
| http://localhost:5173/roadmap | Hoja de ruta pública |
| http://localhost:3001/api/health | Salud de la API (también sirve `client/dist` si existe) |

La base de datos se crea sola en `data/mar.db` (ignorada por git). El servidor lee `.env` solo al arrancar: tras editarlo hay que reiniciar `npm run dev`.

### Claves de las APIs externas

| Variable | Para qué | Dónde se obtiene (gratis) |
|---|---|---|
| `TMDB_API_KEY` | Series y películas (búsqueda, fichas, tendencias, recomendaciones y búsqueda avanzada) | https://www.themoviedb.org/settings/api |
| `OMDB_API_KEY` | Puntuaciones de IMDb y Rotten Tomatoes (1.000 consultas/día) | https://www.omdbapi.com/apikey.aspx |

Sin claves la aplicación arranca igualmente y lo indica en pantalla y en la consola. El anime (MyAnimeList, vía Jikan) no requiere clave.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API y cliente en desarrollo |
| `npm run build` | Compila `client/dist` (Vite) y `server/dist` (tsc) |
| `npm start` | Producción local: sirve API y cliente compilado en :3001 (requiere `build`) |
| `npm test` | Pruebas del servidor (Vitest) |
| `npm run dev:mock -w server` | Aplicación completa con TMDB, Jikan y OMDb **simulados** en :3101 (requiere `build`) |
| `npm run share` | Túnel temporal de Cloudflare hacia :3001 (ver «Probar desde otras máquinas») |
| `npm run mail:test -w server -- correo@dominio` | Comprueba la configuración SMTP |

## Pruebas

### Automáticas (`server/tests`, Vitest)

Cubren las reglas de dominio puras, la API completa y las migraciones. `tests/client.ts` arranca la aplicación con proveedores simulados (`tests/mock-providers.ts`) y una base de datos en memoria; no hace falta red ni claves.

| Fichero | Qué comprueba |
|---|---|
| `domain.test.ts` | Reglas puras: estados, episodios, tiempos, formato de duración |
| `api.test.ts`, `features.test.ts` | Cuentas, biblioteca, amigos, enlaces, perfiles, listas conjuntas |
| `library-manage.test.ts`, `library-page.test.ts` | Revisionado, borrado, paginación por cursor |
| `compare.test.ts`, `theme.test.ts`, `seasons.test.ts` | Comparación de perfiles, tema por usuario, temporadas |
| `news.test.ts` | Notificaciones: reglas puras, motor con TMDB simulado y rendimiento (latencia de la API durante un cálculo de 90 contenidos y límite de peticiones simultáneas) |
| `recommend.test.ts`, `discover.test.ts` | Recomendaciones (fórmula y API) y búsqueda avanzada |
| `pwa.test.ts` | Manifiesto, iconos, service worker y cabeceras de caché |
| `guard.test.ts`, `lists-life.test.ts`, `migrations.test.ts`, `mailer.test.ts` | Corte de proveedores caídos, vida de las listas, migraciones, correo |

```bash
npm test
npx vitest run --root server tests/seasons.test.ts     # un solo fichero
```

### Servidor simulado (`dev:mock`)

```bash
npm run build
npm run dev:mock -w server                      # http://localhost:3101
MOCK_SEED=300 npm run dev:mock -w server         # usuario «carga» con 300 contenidos (listas largas)
MOCK_DEMO=1 MOCK_PORT=3102 npm run dev:mock -w server   # demostración (ver abajo)
```

- `JOINT_INACTIVITY_DAYS` y `JOINT_WARNING_DAYS` cortos permiten probar los avisos de las listas conjuntas.
- **Modo demo** (`MOCK_DEMO=1`): títulos conocidos con carátulas SVG generadas (sin imágenes con derechos de autor) y los usuarios `demo` y `lucia` (contraseña `Prueba-12345`, amigos entre sí). Sirve para capturas de pantalla y revisiones visuales. Los datos están en `server/tests/demo-data.ts`.
- **Control de TMDB simulado**: `POST /__mock/state` con un JSON parcial (`extraSeasons`, `status`, `collections`, `movieSearch`, `delayMs`) cambia lo que «devuelve TMDB» para probar las **notificaciones de novedades** en el navegador (temporada anunciada, película relacionada, secuela de una saga). El servidor simulado calcula las novedades sin esperas.
- El servidor simulado **no recarga solo** al cambiar el código del servidor: hay que reiniciarlo. Los cambios del cliente requieren `npm run build`.

### Pruebas en navegador

Los cambios de interfaz se comprueban en un navegador real con `puppeteer-core` y Chromium/Edge en modo headless contra `dev:mock`, no incluido en el repositorio. Esquema habitual: instalar `puppeteer-core` en un directorio temporal, registrar un usuario por API (`fetch` dentro de la página), recorrer la pantalla, medir (desbordes, contraste, objetivos táctiles, peticiones enviadas) y guardar capturas. Con Edge: `headless: true` (el modo `'new'` puede quedarse colgado) y rutas absolutas en `--screenshot`.

Las capturas del README (`docs/img/`) se regeneran con el servidor en modo demo y `scripts/capturas.js` (móvil 390×844 a 2× y escritorio 1280×800):

```bash
npm run build
MOCK_DEMO=1 MOCK_PORT=3102 npm run dev:mock -w server      # en otra terminal
npm install --no-save puppeteer-core@21
BROWSER_PATH="ruta/a/chrome-o-edge" node scripts/capturas.js
```

## Convenciones

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/es/) pequeños (`feat(client): …`, `fix(server): …`, `docs: …`).
- **Versiones** (semver): cambio pequeño (arreglo, ajuste visual) `x.y.Z`; funcionalidad nueva `x.Y.0`; la mayor `X.0.0` solo por decisión del autor. En cada publicación se actualizan `package.json`, `roadmap/roadmap.json` (`release` y la fase) y `docs/CHANGELOG.md`; el pie de la aplicación muestra la versión.
- **Hoja de ruta**: `roadmap/roadmap.json` es la fuente de verdad (fases → funcionalidades → tareas con `status` y `eta`). La página `/roadmap` es de solo lectura.
- **Migraciones**: numeradas y nunca se edita una publicada; se añade una nueva (`server/src/migrations.ts`).
- **Documentación**: `README.md` (visión general), `docs/CHANGELOG.md` (qué cambió en cada versión), `docs/DECISIONES.md` (por qué), `docs/ARQUITECTURA.md` y `docs/API.md` (cómo es), `docs/DESPLIEGUE.md` (cómo publicar).
- **Idioma**: interfaz, mensajes de error y documentación en español; identificadores de código en inglés o español según el contexto del fichero.

## Probar desde otras máquinas (sin hosting)

Una sola aplicación y una sola base de datos: el modo compartido no arranca otro servidor, expone el de desarrollo.

```bash
npm run dev      # terminal 1
npm run share    # terminal 2: compila el cliente y abre el túnel
```

Imprime la dirección en la red local (`http://IP:3001/`) y, si existe `tools/cloudflared/cloudflared.exe` (ignorado por git), una URL HTTPS temporal de Cloudflare. El túnel se niega a abrirse si el servidor usa el `JWT_SECRET` por defecto (público). La URL cambia en cada ejecución y, mientras esté abierta, cualquiera que la conozca puede registrarse en ese entorno. Tras el túnel la cookie de sesión es `Secure` (`trust proxy = loopback`). Si se cambia el cliente hay que volver a lanzar `npm run share` (recompila `client/dist`).

## Solución de problemas

### Avisos «tarda más de lo normal» o «no responde ahora mismo»
La búsqueda espera como máximo 6 s a TMDB y 2 s a Jikan y devuelve lo que ya tiene. Si una fuente no responde se omite un rato (1 min, luego 2, 4… hasta 15) y se vuelve a probar sola. Jikan (MyAnimeList) suele estar bloqueado en redes corporativas; con `JIKAN_ENABLED=false` en `.env` desaparecen las esperas y los avisos (el anime dejará de buscarse). Ajustes: `TMDB_SOFT_MS`, `JIKAN_SOFT_MS`, `PROVIDER_DOWN_MS`, `PROVIDER_DOWN_MAX_MS`.

### «self signed certificate in certificate chain» (redes con inspección HTTPS)
Un proxy de empresa re-firma el tráfico con su propio certificado: el sistema y el navegador lo aceptan, pero Node no usa el almacén del sistema operativo. Sin desactivar nunca la verificación TLS:

1. Exportar el certificado raíz y los intermedios de la empresa a un PEM en `certs/corporate-ca.pem` (carpeta ignorada por git).
2. `npm run dev` y `npm run share` lo detectan (`scripts/ca.js`) y lo pasan a Node como `NODE_EXTRA_CA_CERTS`. También se puede indicar otro fichero con `EXTRA_CA_CERTS` en `.env`.

Herramientas escritas en Go (como `flyctl`) leen `SSL_CERT_FILE` con el mismo PEM; ver `docs/DESPLIEGUE.md`.

### Búsqueda al escribir
Se lanza 300 ms después de la última letra y muestra el tiempo del servidor y el total. Si resultara lenta, `LIVE_SEARCH = false` en `client/src/config.ts` devuelve el comportamiento de buscar solo con Intro o con el botón.

### Correo (SMTP)
Existe un módulo de envío (`server/src/mailer.ts`) que la aplicación todavía no usa: «recuperar contraseña» y «verificar correo» escriben el enlace en la consola del servidor (y lo muestran en pantalla en local). Para dejarlo preparado se definen `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` y se comprueba con `npm run mail:test -w server -- correo@dominio`.

## Trampas conocidas

- Si `vite.config.ts` cambia con `npm run dev` en marcha, Vite se reinicia y pierde el proxy `/api`: reiniciar `npm run dev`.
- `npm run share` y `npm start` sirven `client/dist`: tras cambiar el cliente hay que recompilar. Los cambios del servidor se recargan solos con `ts-node-dev`.
- `client/public/sw.js` contiene el marcador `__BUILD__`, que `vite.config.ts` sustituye al compilar para que cada despliegue cambie el fichero y los navegadores detecten la versión nueva. No eliminarlo. Las rutas `/api` no deben pasar nunca por el service worker.
- La base de datos vive en memoria (`sql.js`) y se vuelca a disco 300 ms después de escribir. **Un solo proceso por fichero**: dos servidores sobre la misma base se pisarían. `db.export()` reinicia la conexión, por lo que se reactiva `PRAGMA foreign_keys` tras cada volcado.
- Comandos de shell largos con muchas comillas fallan con «unexpected EOF»: conviene escribir el script en un fichero. Cuidado con `\d` y `\/` en cadenas de TypeScript o JavaScript.
