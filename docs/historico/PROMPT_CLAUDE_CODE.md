# Prompt para Claude Code — Mis Apps Review (MAR)

> Copiar el bloque de abajo como primer mensaje en Claude Code. Está pensado para ejecutarse **por fases**; no pedir todo de golpe.

---

```
Eres el desarrollador de "Mis Apps Review (MAR)": app web para gestión personal de series, películas y anime vistos / en curso / pendientes.
Responde siempre en español. Código primero, explicación breve después. La interfaz de la app también va en español.

## Restricciones de entorno (obligatorias)
- Windows. Node.js 16.20.2 -> NO uses dependencias que exijan Node >= 18 (p. ej. Vite 5, Vitest 1+, tsx). Fija versiones compatibles (Vite 4.5.x, etc.) y verifica con `npm install` real. Para ejecutar TypeScript en el servidor usa ts-node-dev o nodemon + ts-node.
- Git NO está en el PATH: puede ser portable; úsalo por ruta completa para commits.
- Todo debe levantarse en local con `npm install` + `npm run dev` desde la raíz (monorepo con npm workspaces: /client, /server).
- Documenta CADA cambio relevante: README.md (cómo levantar en local, variables de entorno, scripts), docs/CHANGELOG.md (una entrada por cambio) y docs/DECISIONES.md (por qué se eligió cada tecnología).

## Stack
- Frontend: React 18 + TypeScript + Vite 4 + React Router 6. Estilos: CSS Modules o Tailwind 3. Sin librerías de UI pesadas. Responsive (menú lateral abierto en escritorio, colapsable en móvil).
- Backend: Node + Express 4 + TypeScript. API REST JSON bajo /api.
- BD: SQLite con Prisma 5 (o better-sqlite3 si Prisma da problemas en Node 16). Un único fichero local; migraciones versionadas.
- Auth: registro/login con usuario + correo + contraseña (bcryptjs), sesión por JWT en cookie httpOnly (sameSite). Sin verificación de correo por ahora. Validación con zod en cliente y servidor.
- Seguridad básica: helmet, límite de intentos en login (rate limit), CORS restringido, y .gitignore que excluya .env y el fichero de BD.
- Metadatos externos (se piden desde el BACKEND, claves en .env, nunca en el cliente):
  - Series/películas: TMDB (búsqueda, póster, sinopsis, nº episodios, estudio/productora). El id de IMDb sale de external_ids de TMDB.
  - Anime: Jikan (API no oficial de MyAnimeList; respeta ~3 peticiones/segundo).
  - Puntuaciones: IMDb y Rotten Tomatoes (Tomatometer) vía OMDb en una sola petición (a veces RT no viene: mostrar "—"); MyAnimeList vía Jikan para anime. Filmaffinity queda descartado.
  - CACHÉ OBLIGATORIA en BD de todas las respuestas externas (OMDb gratuito: ~1.000 consultas/día).
  - Claves: pídeme TMDB_API_KEY y OMDB_API_KEY cuando las necesites (no las inventes) y crea un .env.example. Sin claves la app debe arrancar igualmente y avisar claramente de que la búsqueda no está disponible.
  - TMDB exige atribución: logo de TMDB y el aviso "This product uses the TMDB API but is not endorsed or certified by TMDB" en el pie.
- Tests: Vitest compatible con Node 16 (o Jest) para lógica de negocio (formato de tiempo, reglas de estado, límites).

## Modelo de dominio (mínimo)
User(id, username, email, passwordHash, avatarUrl, shareEnabled=false, shareToken, createdAt)
Content(id, externalId, source[tmdb|jikan], type[serie|pelicula|anime], title, posterUrl, synopsis, totalEpisodes, runtimeMinutes NULL (reservado para el futuro), studio, ratings JSON)
UserContent(userId, contentId, status[POR_VER|VIENDO|FINALIZADO|DEJADO], watchedEpisodes, isFavorite, updatedAt)
Reglas:
- Las películas tienen totalEpisodes = 1.
- Favorito (corazón) => estado pasa automáticamente a FINALIZADO y watchedEpisodes = totalEpisodes. Máximo 10 favoritos por usuario (error claro al intentar el 11º). Quitar el favorito SOLO lo elimina de la lista de favoritos del perfil; no cambia estado ni episodios.
- "Ver más adelante" (↪) => POR_VER.
- watchedEpisodes: solo enteros, 0..totalEpisodes. Si se supera, se fija al máximo y el estado pasa a FINALIZADO.
- Transiciones: POR_VER > VIENDO > FINALIZADO | DEJADO (permitir volver atrás manualmente).
- Duración por episodio (constantes configurables en un único fichero): serie 50 min, película 90 min, anime 23 min. Por ahora NO se usa el runtime real de las APIs.
- Horas totales = suma(watchedEpisodes * minutos según type) de TODOS los contenidos, en cualquier estado (Viendo, Dejado, Finalizado).
- Series de varias temporadas: totalEpisodes es el total de todas las temporadas (simplificación).
- Formato de tiempo total: horas hasta 24h; luego días hasta 7 días; luego semanas hasta 4 semanas; luego meses; luego años. Función pura, con tests.
- Perfil compartido: DESACTIVADO por defecto; el usuario lo activa y puede revocar el token.

## UX (principal: sin distracciones)
- Home: UN único cuadro de búsqueda que combina TMDB y Jikan, con filtro por tipo (serie / película / anime), y rejilla de pósters. Cada tarjeta: corazón abajo-izquierda (favorito+visto), flecha ↪ abajo-derecha (ver más tarde). Click en el póster => pestaña de contenido.
- Pestaña de contenido: sinopsis, nº episodios, puntuaciones (IMDb y Rotten Tomatoes para serie y película; MyAnimeList para anime), estudio/productora, estado, contador de episodios vistos con botones − / +; al hacer click en el número se vuelve input numérico.
- Perfil: avatar redondo, nombre, horas totales (formato anterior), top 10 favoritos, contadores por estado.
- Menú lateral: avatar redondo + nombre, luego Inicio, Mi perfil, Mi lista, Mis amigos...
- Login/Registro: botones arriba a la derecha en la landing pública; contraseña ofuscada con botón mostrar/ocultar.

## Fases (haz UNA por vez y espera mi OK)
El desglose completo de fases y tareas numeradas (0.1, 0.2...) está en docs/ROADMAP_PROPUESTO.md y es el contenido inicial de roadmap/roadmap.json. Trabaja tarea a tarea y marca cada una en el JSON al terminarla.
0. Base + roadmap en vivo. 1. Cuentas y layout. 2. Búsqueda y tarjetas. 3. Pestaña de contenido. 4. Perfil.
5. Despliegue en hosting con disco persistente (SQLite) + perfil compartible por URL de solo lectura.
6. Amigos. 7. Listas conjuntas (historial 50 por lista, mín. 15, constante configurable, purgando las más antiguas). 8. Opcionales.

## Fase 0 — Roadmap en vivo
- Ruta /roadmap pública, sin login, visible para todos los usuarios; ya funcional antes que nada más. Las notas de las tareas deben ser neutras (son públicas).
- Fuente de verdad: roadmap/roadmap.json (fases > tareas con estado: pendiente | en_progreso | hecho, fecha y nota). Forma parte del build/despliegue.
- La página lo lee por fetch y se refresca sola con polling cada pocos segundos (sin SSE ni file watchers), mostrando barra de progreso global y por fase.
- La página es SOLO LECTURA, sin formularios de edición ni endpoints de escritura. El roadmap lo mantienes tú (Claude): cuando pida algo nuevo o que choque con el plan, reestructura roadmap.json (añade/mueve/reordena fases y tareas), avísame del cambio y anótalo en docs/CHANGELOG.md.
- Diseño: inspirado en el roadmap de Star Citizen (RSI) pero más simple. Una columna por fase (scroll horizontal) con barra de progreso; dentro, tarjetas por funcionalidad con etiqueta de categoría (Backend/Frontend/Datos/Infra), color por estado y contador de tareas (3/5); click en la tarjeta despliega sus tareas. Cabecera con progreso global y filtro por estado. Tema oscuro, responsive (columnas en vertical en móvil). Poco texto.
- `npm run dev` debe levantar cliente y servidor a la vez e imprimir las URLs de la app y de /roadmap, para ver el progreso en local mientras se desarrolla.
- Regla: tras terminar cualquier tarea, actualiza roadmap.json (es parte de la definición de "hecho").

## Forma de trabajar
- Antes de cada fase, resume el plan en 5-10 líneas y espera confirmación si hay decisiones abiertas.
- Commits pequeños (Conventional Commits). No hagas push sin que lo pida.
- No inventes datos de contenido: todo viene de las APIs o de la BD.
```
