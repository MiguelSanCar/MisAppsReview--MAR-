# Licencias de terceros

## Iconos de línea: Lucide
- Qué: los iconos «emoji» de la interfaz (lista, ojo, marca, notas, carpetas, amigos, repetir, calendario) vienen de **Lucide** a través del paquete `lucide-react` (versión 0.469.0): contorno blanco, sin relleno.
- Origen: https://lucide.dev · https://github.com/lucide-icons/lucide
- Licencia: **ISC** (permisiva; solo exige conservar el aviso de copyright y la licencia). Lucide es un fork de Feather (MIT).
  - Copyright (c) para Lucide Contributors 2022 y, en las partes derivadas de Feather, (c) 2013-2022 Cole Bemis.
- Por qué: se pidió que los iconos fueran de contorno blanco y transparentes por dentro; los emojis del sistema y los de color (p. ej. Twemoji) son figuras rellenas.
- Cómo se usan: `client/src/components/Emoji.tsx` (se cargan solo los 8 iconos necesarios).

## Logotipo: fuente Lock Block (⚠ solo uso personal)
- Qué: el logotipo «MAR» (cabecera, roadmap) y la «M» del favicon y de los iconos de la PWA son los **glifos M, A y R de la fuente Lock Block**, convertidos a trazados SVG (`client/src/components/Logo.tsx`, `client/public/favicon.svg`, `client/public/icons/`). El fichero de la fuente **no** está en el repositorio ni se sirve.
- Autor y origen: Sronstudio (Yusron Billah) · https://www.dafont.com/es/lock-block.font · versión completa y licencia comercial: https://sronstudio.com/product/lock-block-block-display-font/
- Licencia: la descarga de dafont es una versión **demo «PERSONAL USE ONLY»**. Su nota dice que usarla en proyectos comerciales sin comprar licencia obliga a pagar las tasas y una penalización de 10 veces el precio de la licencia corporativa.
- Por qué: se pidió usar exactamente la letra de esa fuente. MAR es una app personal, gratuita y sin ánimo de lucro, para uso del autor y sus amigos.
- **Si MAR llega a tener uso comercial** (anuncios, suscripciones, empresa…), hay que comprar la licencia o sustituir el logotipo: el trazado propio anterior (letras de bloque dibujadas a mano) está en el historial de git, commit «feat(client): logotipo MAR en SVG y favicon».

## Datos y servicios
- Series y películas: TMDB (aviso de atribución en el pie de página).
- Puntuaciones: OMDb. Anime: Jikan / MyAnimeList.
