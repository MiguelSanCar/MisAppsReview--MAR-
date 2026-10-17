// Importar la lista de anime de MyAnimeList (Ajustes › Mi perfil). CONTRATO: el agente del cliente lo implementa.
// API: POST /api/import/mal/preview { username } y POST /api/import/mal/file (cuerpo en bruto) → ImportPreview;
//      POST /api/import/mal/confirm { token } → ImportResult (ver server/src/importTypes.ts).
export function MalImport() {
  return null;
}
