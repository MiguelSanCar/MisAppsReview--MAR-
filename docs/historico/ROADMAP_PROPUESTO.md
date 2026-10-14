# Roadmap propuesto (borrador, sin implementar)

Este desglose es el contenido inicial de `roadmap/roadmap.json`. La página pública `/roadmap` lo muestra en vivo (sin login). Las notas de cada tarea deben ser neutras, porque las verá cualquiera.

Estados: `pendiente` · `en_progreso` · `hecho`

## Fase 0 — Base y roadmap en vivo
- 0.1 Monorepo npm workspaces (`/client`, `/server`) con versiones compatibles con Node 16
- 0.2 README con cómo levantar en local + CHANGELOG + DECISIONES + `.env.example` + `.gitignore`
- 0.3 `roadmap.json` con todas las fases y tareas de este documento
- 0.4 Página `/roadmap` pública, solo lectura, con diseño visual tipo "roadmap de juego" (ver abajo)
- 0.5 Barra de progreso global y por fase
- 0.6 Actualización en vivo: cuando Claude modifica `roadmap.json`, la página se refresca sin recargar
- 0.7 Script único `npm run dev` que levanta cliente y servidor e imprime las URLs (app y /roadmap)

### Diseño de la página `/roadmap`
Inspirado en el roadmap de Star Citizen (RSI), pero más simple:
- Una columna por fase, en horizontal con scroll, con título y barra de progreso arriba.
- Dentro, tarjetas por funcionalidad con etiqueta de categoría (Backend, Frontend, Datos, Infra), estado por color (pendiente, en progreso, hecho) y contador de tareas (p. ej. 3/5).
- Click en una tarjeta: se despliega la lista de tareas. Nada de textos largos.
- Cabecera con progreso global y filtro por estado. Tema oscuro, responsive (en móvil las columnas pasan a vertical).

### Cómo se mantiene
Solo lectura en la web. Si pides algo nuevo o que choque con el plan, Claude modifica `roadmap.json` (añade, mueve o reordena fases y tareas) y lo anota en el CHANGELOG.

## Fase 1 — Cuentas y estructura
- 1.1 Modelo User + BD SQLite + migraciones
- 1.2 Registro (usuario, correo, contraseña) con validación
- 1.3 Login / logout con cookie httpOnly
- 1.4 Formulario con botón mostrar/ocultar contraseña
- 1.5 Landing pública con botones Iniciar sesión / Registrarse arriba a la derecha
- 1.6 Layout con menú lateral (avatar redondo, nombre, Inicio, Mi perfil, Mi lista, Mis amigos), abierto en escritorio y colapsable en móvil
- 1.7 Seguridad básica: helmet, límite de intentos de login, CORS restringido

## Fase 2 — Búsqueda y tarjetas (núcleo)
- 2.1 Integración TMDB en backend + caché
- 2.2 Integración Jikan (anime) + caché
- 2.3 Buscador único (TMDB + Jikan) con filtro por tipo y rejilla de pósters
- 2.7 Pie con atribución a TMDB y aviso si faltan las claves de API
- 2.4 Botón corazón (favorito → pasa a visto), máximo 10
- 2.5 Botón ↪ (ver más adelante)
- 2.6 Estados vacíos y errores de API

## Fase 3 — Pestaña de contenido
- 3.1 Vista de detalle: sinopsis, episodios, estudio/productora
- 3.2 Puntuaciones: IMDb y Rotten Tomatoes (OMDb) y MyAnimeList (anime)
- 3.3 Estados: Por ver > Viendo > Finalizado / Dejado
- 3.4 Contador de episodios con botones − / +
- 3.5 Edición manual del contador (solo números, tope = total → Finalizado)
- 3.6 Mi lista (todos los estados, filtros)

## Fase 4 — Perfil (núcleo)
- 4.1 Cálculo de horas totales con duración fija por tipo (serie 50 min, película 90 min, anime 23 min)
- 4.2 Formato escalonado: horas → días → semanas → meses → años (con tests)
- 4.3 Top 10 favoritos
- 4.4 Contadores por estado
- 4.5 Avatar: subida y recorte circular
- 4.6 Duración real por contenido y episodio (prioridad media, futuro): sustituye las duraciones fijas por datos de las APIs

## Fase 5 — Despliegue y compartir
- 5.1 Elegir hosting con disco persistente para SQLite
- 5.2 Variables de entorno y configuración de producción
- 5.3 Despliegue del servidor y cliente
- 5.4 URL pública de perfil de solo lectura (desactivada por defecto, token revocable)
- 5.5 Compartir lista de visualizados (solo lectura)
- 5.6 Copia de seguridad / exportar datos

## Fase 6 — Amigos
- 6.1 Solicitudes y lista de amigos
- 6.2 Pantalla de tarjetas de amigos
- 6.3 Perfil ajeno con menú "Su lista", "Sus amigos"
- 6.4 Inicio devuelve al menú propio

## Fase 7 — Listas conjuntas
- 7.1 Modelo de lista compartida entre dos usuarios
- 7.2 Edición compartida de contenidos, episodios y estados
- 7.3 Historial de cambios (quién, qué, cuándo), máx. 50 por lista (mín. exigido 15)
- 7.4 Rollback al pasar el ratón sobre una entrada (el rollback también se registra)

## Fase 8 — Opcionales
- 8.1 Recuperación de contraseña (requiere correo)
- 8.2 Verificación de correo
- 8.3 Buzón de ideas en `/roadmap` (prioridad baja): campo rápido para apuntar ideas y revisarlas después. Requiere escritura en local, protegida a localhost

## Decisiones tomadas
- Filmaffinity: descartado. Puntuaciones: IMDb y Rotten Tomatoes (vía OMDb) y MyAnimeList.
- Duración por episodio fija: serie 50 min, película 90 min, anime 23 min (la real queda como 4.6, prioridad media).
- Quitar un favorito solo lo saca de la lista de favoritos; no altera estado ni episodios.
- Compartir perfil: se despliega en hosting.
- Formato de tiempo: horas → días → semanas → meses → años.
- Historial de listas conjuntas: 50 por lista.

---

## Fases 10, 11 y 12 (añadidas tras la fase 9)

Detalle completo y estado en `roadmap/roadmap.json` (página `/roadmap`). Orden elegido: primero los ajustes rápidos de menú y tarjetas (fase 10), después los perfiles con URL propia (fase 11), porque la fase 12 (menú del amigo, «Vuestra lista») usa esas direcciones y así no se rehace.

### Fase 10 · Menú y listas (0.11.0)
- «Inicio» diferenciado y a la altura de «Ajustes»; «Listas conjuntas» pasa a «Mis listas conjuntas».
- La flecha de las tarjetas de «Mi lista» pasa el contenido a la siguiente fase y se oculta en «Todos».

### Fase 11 · Perfiles con URL propia (0.12.0)
- `/perfil/<usuario>` sustituye a `/friend/<número>`; subpáginas `/lista` y `/amigos`.
- Visibilidad del perfil: **solo amigos (por defecto)** o **público**. Un perfil público lo ve cualquiera, también sin cuenta; uno privado, solo sus amigos (los demás ven un aviso con la opción de enviar solicitud).
- Sustituye al enlace con token actual (los perfiles ya compartidos pasan a públicos).

### Fase 12 · Vuestra lista (0.13.0)
- «Vuestra lista» en el menú del perfil de un amigo: abre la lista conjunta de la pareja o, si no existe, «Aún no tenéis una lista conjunta» + «Crear nueva lista conjunta».
- Una lista por pareja de momento (modelo preparado para varias). Cualquiera de los dos puede crearla sin permiso del otro.
- Se puede salir de una lista sin borrarla (y volver a unirse). Se borra tras **2 meses sin actividad**, con aviso 15 días antes (en la app y por correo; el correo real necesita configurar SMTP: base lista en 12.9; conectarlo y el aviso por correo, 12.10 y 12.12, en prioridad baja).

### Criterios asumidos (confirmar o corregir)
1. «Si se consume» se ha interpretado como «si se accede a la URL».
2. Por defecto un perfil es **solo para amigos** (más privado que hoy, donde el enlace público ya existe pero desactivado).
3. El nombre de usuario es la dirección del perfil y no se puede cambiar (no hay función de renombrar).
4. «Actividad» de una lista = cualquier cambio (añadir, quitar, estado, episodios, rollback, unirse o salir).
5. Si las dos personas salen de una lista, sigue existiendo hasta el borrado por inactividad y cualquiera puede volver a unirse.
6. Al borrarse una lista se pierde también su historial.
