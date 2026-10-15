# Despliegue de MAR

Estado: **publicado en Fly.io** → https://mar.fly.dev (app `mar`, región `cdg`, 1 máquina de 512 MB, volumen `data` de 1 GB en `/data`). Render queda como alternativa (`render.yaml`).

## Operar Fly.io con `flyctl`
`flyctl` va en `tools/fly.exe` (ignorado por git). Instalación: el script oficial (`iwr https://fly.io/install.ps1 -useb | iex`) o, si PowerShell está restringido o no hay administrador, el `.zip` de https://github.com/superfly/flyctl/releases (extraer `flyctl.exe` y renombrarlo a `fly.exe`; no necesita administrador).
```bash
tools/fly.exe auth login                    # una vez; si el navegador es de otra sesión: auth login --code <código>
tools/fly.exe deploy --app mar       # desplegar (construye en remoto)
tools/fly.exe status --app mar
tools/fly.exe logs --app mar
tools/fly.exe secrets set CLAVE=valor --app mar
tools/fly.exe ssh sftp shell --app mar   # copiar /data/mar.db
```
- Cada `fly deploy` sube el directorio actual para construir la imagen: no dejes ahí nada sensible.
- Nunca imprimir ni versionar los secretos: se cargan con `fly secrets import` desde un fichero temporal que se borra después.
- Región: Madrid (`mad`) ya no existe en Fly; se usa París (`cdg`).

### Tras cada despliegue (PWA)
- `vite.config.ts` sella `dist/sw.js` con un identificador nuevo en cada compilación: los móviles que ya tienen la app instalada detectan la versión nueva y muestran «Hay una versión nueva · Actualizar» (también al volver a abrirla).
- `sw.js`, `index.html`, `offline.html` y el manifiesto se sirven con `Cache-Control: no-cache`; los ficheros de `/assets` son inmutables. No hace falta purgar nada.
- Comprobación rápida: `/manifest.webmanifest`, `/sw.js` y `/offline.html` responden 200.

### Según el equipo desde el que trabajes
- **Equipo con acceso directo a Internet (casa):** los comandos de arriba funcionan tal cual; no hace falta nada más.
- **Equipo con proxy que re-firma HTTPS (empresa):** `flyctl` (escrito en Go) no usa el almacén de Windows y falla con `x509: certificate signed by unknown authority`. Pásale el PEM de la empresa (el mismo `certs/corporate-ca.pem` del README, ignorado por git) con `SSL_CERT_FILE=<ruta al PEM>`, y si el builder por defecto (Depot) sigue fallando, añade `--depot=false --remote-only`. Nunca se desactiva la verificación TLS. Un aviso «DNS verification failed» al final del despliegue puede ser solo de esa red.
- Las notas del equipo concreto (rutas, proxy, permisos) van en `CLAUDE.local.md`, que no se versiona. Al cambiar de ordenador: copiar el repo, `npm install`, tu `.env`, descargar `tools/fly.exe`, `fly auth login` y, si procede, tu propio `CLAUDE.local.md`.

Lo siguiente es la preparación original, válida para cualquier hosting.

## Qué necesita el hosting
- Ejecutar un contenedor Docker o `npm start` con **Node 16 o superior**.
- **Disco persistente** montado en `/data`: la base de datos es un fichero SQLite. Sin disco, los datos se pierden en cada reinicio.
- HTTPS (lo dan todos los proveedores). La cookie de sesión se marca `Secure` automáticamente tras el proxy.
- Una sola instancia (SQLite no admite varias escribiendo a la vez).

## Variables de entorno
| Variable | Obligatoria | Para qué |
|---|---|---|
| `JWT_SECRET` | Sí (si falta, el servidor no arranca) | Firma de sesiones. Una cadena larga aleatoria |
| `PUBLIC_URL` | Sí | URL pública (`https://...`), para enlaces de correo |
| `CLIENT_ORIGIN` | Sí | El mismo valor que `PUBLIC_URL` (CORS) |
| `NEWS_TTL_ACTIVE_MS` / `NEWS_TTL_IDLE_MS` | No (12 h / 7 días) | Cada cuánto se revisan las novedades de series en emisión / de series terminadas y películas |
| `NEWS_BUDGET` / `NEWS_CONCURRENCY` | No (`30` / `3`) | Contenidos consultados por ronda y peticiones simultáneas a TMDB (límite global) |
| `NEWS_USER_INTERVAL_MS` | No (30 min) | Cada cuánto se programa un refresco de novedades por persona |
| `TMDB_REGION` | No (`ES`) | País para saber en qué plataformas (Netflix, HBO…) está disponible cada título |
| `TMDB_API_KEY` | Para series/películas | https://www.themoviedb.org/settings/api (gratis) |
| `OMDB_API_KEY` | Para IMDb + Rotten Tomatoes | https://www.omdbapi.com/apikey.aspx (gratis, 1.000/día) |
| `DB_FILE` | No (`/data/mar.db` en Docker) | Ruta del fichero SQLite |
| `PORT` | No (`3001`) | Puerto |
| `JIKAN_ENABLED` | No (`true`) | `false` desactiva la búsqueda de anime (Jikan) |
| `TMDB_SOFT_MS` / `JIKAN_SOFT_MS` | No (`6000` / `2000`) | Espera máxima de la búsqueda a cada fuente |
| `USE_REAL_RUNTIME` | No (`true`) | `false` = duraciones fijas 50/90/23 min en lugar de las reales de las APIs |
| `RUNTIME_SAMPLE` | No (`4`) | Episodios de muestra por temporada larga (más del triple) o por serie (temporadas cortas) |
| `RUNTIME_MAX_FETCH` / `RUNTIME_CONCURRENCY` | No (`12` / `2`) | Peticiones máximas a TMDB por serie y peticiones simultáneas globales para calcular duraciones |
| `JOINT_HISTORY_LIMIT` | No (`50`, mínimo 15) | Modificaciones guardadas por lista conjunta |
| `JOINT_INACTIVITY_DAYS` / `JOINT_WARNING_DAYS` | No (`60` / `15`) | Borrado de listas conjuntas por inactividad y antelación del aviso |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | No (sin usar todavía) | Envío de correos; ver `npm run mail:test -w server` |

## Opciones de hosting
| | Render | Fly.io |
|---|---|---|
| Disco persistente | Solo en plan de pago (~7 USD/mes) | Volúmenes pequeños, coste muy bajo |
| Dificultad | Muy baja (web) | Media (línea de comandos) |
| Archivo listo | `render.yaml` | Usa el `Dockerfile` |

**Recomendación:** Render si prefieres lo más sencillo; Fly.io si quieres gastar lo mínimo.

### Render
1. Sube el repo a GitHub.
2. En Render: *New → Blueprint* y elige el repo (usa `render.yaml`).
3. Rellena `PUBLIC_URL`, `CLIENT_ORIGIN`, `TMDB_API_KEY`, `OMDB_API_KEY`.
4. Al terminar, abre la URL y comprueba `/api/health` y `/roadmap`.

### Fly.io
```bash
fly launch --no-deploy            # detecta el Dockerfile; internal_port = 3001
fly volumes create data --size 1
# en fly.toml:  [mounts] source = "data"  destination = "/data"
fly secrets set JWT_SECRET=$(openssl rand -hex 32) PUBLIC_URL=https://TU-APP.fly.dev CLIENT_ORIGIN=https://TU-APP.fly.dev TMDB_API_KEY=... OMDB_API_KEY=...
fly deploy
```

## Probar la imagen en local (no verificado: falta el motor de Docker)
```bash
docker build -t mar .
docker run -p 3001:3001 -v mar-data:/data -e JWT_SECRET=algo-largo -e PUBLIC_URL=http://localhost:3001 -e CLIENT_ORIGIN=http://localhost:3001 mar
```

## Probar el build de producción sin Docker (verificado)
```bash
npm run build
NODE_ENV=production JWT_SECRET=algo-largo PORT=3001 node server/dist/index.js
```

## Tras desplegar
- Comprueba `/roadmap` (público) y que registrarse / iniciar sesión funciona.
- Compartir perfil: Ajustes → activar enlace; la URL ya será accesible para otras personas.
- Copias de seguridad: cada usuario puede exportar sus datos en Ajustes. Para copiar toda la BD, descarga `/data/mar.db` del disco.
- Roadmap: se despliega con la imagen (`roadmap/roadmap.json`); para actualizarlo, redespliega.
- El correo no sale de la consola del servidor (recuperar contraseña y verificar correo muestran el enlace en los logs) hasta que se configure un servicio de correo.
