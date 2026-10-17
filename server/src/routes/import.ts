import { Router } from 'express';

// Importación desde MyAnimeList (/api/import). CONTRATO: el agente de servicio y rutas lo implementa.
//   POST /mal/preview  { username }                       → ImportPreview
//   POST /mal/file     cuerpo en bruto (.xml / .xml.gz)    → ImportPreview   (application/octet-stream|gzip|xml, 2 MB)
//   POST /mal/confirm  { token }                          → ImportResult
// Con sesión y límite propio de 10 peticiones cada 15 minutos por persona.

export const importRouter = Router();
