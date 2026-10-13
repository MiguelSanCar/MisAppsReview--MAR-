import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlValue } from 'sql.js';
import { config } from './config';
import { MIGRATIONS } from './migrations';

// SQLite en WASM (sql.js): sin compilar nada nativo. La BD vive en memoria y se
// vuelca al fichero tras cada escritura (con un pequeño retardo).

let db: Database;
let file: string | null = null;
let timer: NodeJS.Timeout | null = null;

export type Param = SqlValue | boolean | undefined;
const norm = (p: Param[]): SqlValue[] => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export async function openDb(dbFile: string | null = config.dbFile) {
  const SQL = await initSqlJs();
  file = dbFile;
  db = file && fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  migrate();
  flush();
}

function migrate() {
  db.run('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');
  const current = (get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations')?.v) ?? 0;
  for (const m of MIGRATIONS.filter((x) => x.version > current)) {
    transaction(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [m.version, m.name, new Date().toISOString()]);
    });
  }
}

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = db.export(); // export() reinicia la conexión: hay que reactivar las claves foráneas
  db.run('PRAGMA foreign_keys = ON');
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(data));
  fs.renameSync(tmp, file);
}

function scheduleSave() {
  if (!file || timer) return;
  timer = setTimeout(flush, 300);
}

export function closeDb() {
  flush();
  db?.close();
}

export function run(sql: string, params: Param[] = []) {
  db.run(sql, norm(params));
  const changes = db.getRowsModified();
  const lastId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  scheduleSave();
  return { changes, lastId };
}

export function all<T = any>(sql: string, params: Param[] = []): T[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(norm(params));
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T);
    return rows;
  } finally {
    stmt.free();
  }
}

export function get<T = any>(sql: string, params: Param[] = []): T | undefined {
  return all<T>(sql, params)[0];
}

export function transaction<T>(fn: () => T): T {
  db.run('BEGIN');
  try {
    const r = fn();
    db.run('COMMIT');
    scheduleSave();
    return r;
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}

process.on('exit', () => {
  try { flush(); } catch { /* nada */ }
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    try { flush(); } catch { /* nada */ }
    process.exit(0);
  });
}
