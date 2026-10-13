# MisAppsReview (MAR)

Aplicación para la gestión de series, películas o animes que ha visto una persona, con conexión para varios usuarios y algunas otras funcionalidades. Se ha creado con Claude Code como prueba.

> **Versión 0.15.0** · Las versiones 0.x siguen el [roadmap](#roadmap): cada fase completada sube un número (fase 0 = 0.1, fase 1 = 0.2 … fase 14 = 0.15). La 1.0 se reserva para cuando el despliegue esté publicado y revisado.

## Qué hace
- **Pantalla inicial**: las series más vistas del momento (o películas / anime según el filtro).
- **Buscar y marcar** (Inicio): un buscador único cuyos resultados van apareciendo **mientras escribes** (series y películas con TMDB, anime con MyAnimeList/Jikan); cada tarjeta indica año, categoría y plataforma de origen. Sobre cada póster: **♥ abajo a la izquierda** = favorito (se marca como visto; máximo 10) y **↪ abajo a la derecha** = ver más adelante.
- **Ficha del contenido**: sinopsis, estudio, puntuaciones (IMDb y Rotten Tomatoes; MyAnimeList en anime), estado (Por ver → Viendo → Finalizado / Dejado) y contador de episodios con − / + (al pulsar el número se escribe a mano; si se supera el total se fija el máximo y pasa a Finalizado).
- **Perfil**: avatar redondo, tiempo total visto (horas → días → semanas → meses → años), contadores por estado y top 10 de favoritas.
- **Perfiles con URL propia** (`/perfil/<usuario>`): solo para amigos (por defecto) o públicos, con la lista opcional.
- **Enlaces de amistad**: pulsa tu nombre en el menú lateral para copiar un enlace que añade como amigo a quien lo abra; en el perfil de un amigo, el enlace envía una solicitud a esa persona. Pulsa tu foto para verla o cambiarla.
- **Amigos**: solicitudes, tarjetas, y perfil/lista/amigos de cada amigo con el menú lateral adaptado ("Su perfil", "Su lista"…).
- **Listas conjuntas** («Vuestra lista» en el perfil de un amigo): una por pareja, que cualquiera de los dos puede crear; ambos la editan y cada modificación queda en un historial con **Rollback**. Se puede **salir sin borrarla** y volver a unirse; se borra tras 2 meses sin actividad (con aviso 15 días antes en la app).
- En **Mi lista**, la flecha de cada tarjeta pasa el contenido a la siguiente fase (Por ver → Viendo → Finalizado) y, en «Finalizado», lo devuelve a «Por ver» para **volver a verlo** (se muestra como «Reviendo»; tus estadísticas conservan lo ya visto). Cada tarjeta tiene una **papelera** y el botón rojo **«Eliminar»** activa el borrado múltiple (con confirmación); borrar un contenido resta sus episodios y minutos de tu perfil.
- **Roadmap público** en `/roadmap`, en vivo.

## Levantar en local

Requisitos: **Node.js 16.20.2** (las dependencias están fijadas para esta versión) y npm 8. No hace falta compilar nada nativo.

```bash
npm install      # instala cliente y servidor (npm workspaces)
npm run dev      # levanta servidor (3001) y cliente (5173) a la vez
```

| Qué | URL |
|---|---|
| App | http://localhost:5173/ |
| Roadmap | http://localhost:5173/roadmap |
| API (salud) | http://localhost:3001/api/health |

Para parar: `Ctrl + C` en la terminal. La base de datos se crea sola en `data/mar.db` (ignorada por git).

### Claves de las APIs (para buscar series y películas)
Copia `.env.example` a `.env` en la raíz y rellena:

| Variable | Para qué | Dónde se consigue (gratis) |
|---|---|---|
| `TMDB_API_KEY` | Buscar series y películas | https://www.themoviedb.org/settings/api |
| `OMDB_API_KEY` | Puntuaciones IMDb y Rotten Tomatoes | https://www.omdbapi.com/apikey.aspx |

Tras pegar las claves, **reinicia** `npm run dev` (el servidor lee `.env` solo al arrancar).

Sin claves la app arranca igual: avisa en pantalla y en la consola. **El anime funciona sin clave** (Jikan). Reinicia `npm run dev` tras editar `.env`.

### Avisos «tarda más de lo normal» / «no responde ahora mismo»
No son errores de la app: la búsqueda espera como máximo 6 s a TMDB y 2 s a Jikan y devuelve lo que ya tiene. Si una fuente no responde, se omite un rato (1 min, luego 2, 4… hasta 15) y se vuelve a probar sola. **Jikan (MyAnimeList) suele estar bloqueado en redes corporativas**; si es tu caso, desactívalo y desaparecen los avisos y las esperas:
```
JIKAN_ENABLED=false     # en .env; reinicia npm run dev (el anime dejará de buscarse)
```
Otros ajustes: `TMDB_SOFT_MS`, `JIKAN_SOFT_MS`, `PROVIDER_DOWN_MS`, `PROVIDER_DOWN_MAX_MS`.

### Red corporativa que inspecciona HTTPS (error "self signed certificate in certificate chain")
Si TMDB falla con ese error es que tu red (p. ej. Netskope) re-firma el tráfico con su propio certificado: Windows y el navegador lo aceptan, pero Node no usa el almacén de Windows. Solución, sin desactivar ninguna verificación:
1. Exporta el certificado raíz de la empresa y los intermedios a un PEM en `certs/corporate-ca.pem` (carpeta ignorada por git). Con PowerShell: `Export-Certificate -Cert <cert> -FilePath x.cer` y conviértelos a PEM (base64 entre `-----BEGIN CERTIFICATE-----` y `-----END CERTIFICATE-----`).
2. `npm run dev` y `npm run share` lo detectan solos (`scripts/ca.js`) y lo pasan a Node como `NODE_EXTRA_CA_CERTS`. También puedes apuntar a otro fichero con `EXTRA_CA_CERTS=ruta` en `.env`.

> Si un proveedor (p. ej. Jikan/MyAnimeList) está bloqueado por la red, la búsqueda lo omite un rato (con retroceso progresivo) y avisa en pantalla; el resto sigue funcionando. Ver «Avisos» más arriba.

### Probar desde otras máquinas (sin hosting)
Una sola app y **una sola base de datos** (`data/mar.db`): el modo compartido no arranca otro servidor, expone el de desarrollo.
```bash
npm run dev      # terminal 1 (el servidor de la API en :3001 también sirve el cliente compilado)
npm run share    # terminal 2: compila el cliente y abre el túnel
```
Imprime:
- **Misma red** (oficina/Wi-Fi): `http://TU-IP:3001/`. Si Windows pregunta por el firewall, permite redes privadas.
- **Otras redes**: una URL HTTPS temporal (`https://xxxx.trycloudflare.com`) mediante un túnel de Cloudflare. Hace falta `cloudflared.exe` en `tools/cloudflared/` (ignorado por git):
  ```bash
  mkdir -p tools/cloudflared
  curl -L -o tools/cloudflared/cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  ```

Seguridad y detalles:
- Usa el `JWT_SECRET` de `.env` (se genera solo la primera vez). **Si el servidor corre con el secreto por defecto (público), `npm run share` se niega a abrir el túnel**; reinicia `npm run dev` tras generarlo.
- La URL cambia cada vez; mientras esté abierta, cualquiera que la conozca puede registrarse **y llegar a tu entorno de desarrollo**. `Ctrl + C` cierra solo el túnel.
- Detrás del túnel la cookie de sesión es `Secure` (el servidor confía en proxies del propio equipo, `trust proxy = loopback`).
- Si cambias el cliente, vuelve a lanzar `npm run share` (recompila `client/dist`). Los cambios del servidor se recargan solos.

### Búsqueda al escribir
Se lanza 300 ms después de la última letra y la pantalla muestra cuánto tardó (servidor y total). Si resultara lenta, pon `LIVE_SEARCH = false` en `client/src/config.ts`: vuelve a buscarse solo con Enter o con el botón .

### Correo (SMTP): base lista, sin usar todavía
Existe un módulo de envío (`server/src/mailer.ts`) pero la app aún no lo usa: recuperar contraseña y verificar correo escriben el enlace en la consola. Para dejarlo preparado, define en `.env` `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` (ver `.env.example`) y comprueba la conexión con:
```bash
npm run mail:test -w server -- tu@correo.com
```

### Comandos útiles
```bash
npm test                          # 146 tests (dominio + API completa con proveedores simulados)
npm run build                     # compila cliente (client/dist) y servidor (server/dist)
npm start                         # producción local: sirve API + cliente en el puerto 3001 (requiere build)
npm run dev:mock -w server        # app completa con TMDB/Jikan/OMDb SIMULADOS (títulos falsos) en el puerto 3101
```
`dev:mock` sirve `client/dist`, así que haz `npm run build` antes. Sirve para probar la interfaz sin claves ni internet; los datos son ficticios y se pierden al pararlo.

## Estructura

```
client/    React 18 + TypeScript + Vite 4 (interfaz)
server/    Node + Express 4 + TypeScript (API /api), SQLite (sql.js) y tests (Vitest)
roadmap/   roadmap.json: fuente de verdad del roadmap (ideas.json: buzón local, ignorado)
scripts/   dev.js: arranque conjunto en local
docs/      CHANGELOG, DECISIONES, DESPLIEGUE, prompt y roadmap original
Dockerfile, render.yaml   despliegue (ver docs/DESPLIEGUE.md)
```

## Roadmap

`/roadmap` es público y de solo lectura. Lee `roadmap/roadmap.json` y se refresca solo cada pocos segundos. Formato: `phases[] > features[] > tasks[]`; cada tarea tiene `status` (`pendiente`, `en_progreso`, `hecho`) y el de cada tarjeta se calcula a partir de sus tareas. Cada tarea lleva su **fecha de entrega** (`eta`: la real si está hecha, la estimada si no) y, si no puede tener fecha por depender de algo externo, `etaNote` con el motivo y el esfuerzo; las tarjetas y columnas muestran la de su última tarea pendiente. El roadmap lo mantiene Claude: si se pide algo que choca con el plan, se reestructura el JSON y se anota en el CHANGELOG.

En local, además, aparece un **buzón de ideas** (solo desde `localhost`, no en producción): se guardan en `roadmap/ideas.json`.

## Estado
Todo el roadmap está implementado y probado **salvo lo que depende de ti o está en prioridad baja**: la publicación en un hosting (5.1 y 5.3, necesita una cuenta; pasos en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)) y conectar el envío de correos (12.10 y 12.12).

Limitaciones conocidas:
- La duración por episodio es fija (serie 50 min, película 90, anime 23) salvo que actives `USE_REAL_RUNTIME=true` (usa la duración media de las APIs).
- Series con varias temporadas cuentan como un único total de episodios.
- El correo no sale: "recuperar contraseña" y "verificar correo" escriben el enlace en la consola del servidor (y lo muestran en pantalla en local). El aviso por correo del borrado de listas conjuntas aún no existe (solo el aviso en la app).
- Las APIs externas solo se han probado contra servidores simulados; la primera búsqueda real con tus claves es la prueba definitiva.

## Documentación
- [docs/CHANGELOG.md](docs/CHANGELOG.md): cambios realizados
- [docs/DECISIONES.md](docs/DECISIONES.md): por qué se eligió cada tecnología
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md): publicar la app
- [docs/PROMPT_CLAUDE_CODE.md](docs/PROMPT_CLAUDE_CODE.md): prompt de desarrollo
- [docs/ROADMAP_PROPUESTO.md](docs/ROADMAP_PROPUESTO.md): desglose original de fases
