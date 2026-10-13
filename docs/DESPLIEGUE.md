# Despliegue de MAR

Estado: **preparado, sin publicar** (hace falta una cuenta de hosting tuya). Todo lo siguiente está listo en el repo; lo que no se ha podido probar aquí (Docker está instalado en este equipo pero su motor no estaba en marcha, así que la imagen no se ha podido construir) está marcado.

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
| `TMDB_API_KEY` | Para series/películas | https://www.themoviedb.org/settings/api (gratis) |
| `OMDB_API_KEY` | Para IMDb + Rotten Tomatoes | https://www.omdbapi.com/apikey.aspx (gratis, 1.000/día) |
| `DB_FILE` | No (`/data/mar.db` en Docker) | Ruta del fichero SQLite |
| `PORT` | No (`3001`) | Puerto |
| `USE_REAL_RUNTIME` | No (`false`) | `true` = duración real de las APIs en lugar de 50/90/23 min |
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
