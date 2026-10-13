// Migraciones versionadas. NUNCA editar una ya publicada: añadir una nueva.
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'usuarios',
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        avatar TEXT,
        avatar_v INTEGER NOT NULL DEFAULT 0,
        share_enabled INTEGER NOT NULL DEFAULT 0,
        share_list INTEGER NOT NULL DEFAULT 0,
        share_token TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'contenido y biblioteca',
    sql: `
      CREATE TABLE content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        poster_url TEXT,
        synopsis TEXT,
        year INTEGER,
        total_episodes INTEGER,
        runtime_minutes INTEGER,
        studio TEXT,
        imdb_id TEXT,
        ratings TEXT,
        detailed_at TEXT,
        ratings_at TEXT,
        ratings_try_at TEXT,
        UNIQUE (source, external_id)
      );
      CREATE TABLE user_content (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'POR_VER',
        watched_episodes INTEGER NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, content_id)
      );
      CREATE INDEX idx_user_content_user ON user_content(user_id, status);
      CREATE TABLE api_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 3,
    name: 'amistades',
    sql: `
      CREATE TABLE friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        UNIQUE (requester_id, addressee_id)
      );
    `,
  },
  {
    version: 4,
    name: 'listas conjuntas',
    sql: `
      CREATE TABLE joint_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE joint_list_members (
        list_id INTEGER NOT NULL REFERENCES joint_lists(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (list_id, user_id)
      );
      CREATE TABLE joint_list_items (
        list_id INTEGER NOT NULL REFERENCES joint_lists(id) ON DELETE CASCADE,
        content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'POR_VER',
        watched_episodes INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (list_id, content_id)
      );
      CREATE TABLE joint_list_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL REFERENCES joint_lists(id) ON DELETE CASCADE,
        content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        before_state TEXT,
        after_state TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_joint_history ON joint_list_history(list_id, content_id, id);
    `,
  },
  {
    version: 5,
    name: 'tokens de recuperación y verificación',
    sql: `
      CREATE TABLE auth_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 6,
    name: "enlaces de amistad",
    sql: `
      -- Cada enlace guarda quién lo generó (creator_id).
      --   befriend: quien lo abre pasa a ser amigo de creator_id (target_id = 0).
      --   request:  quien lo abre envía una solicitud a target_id (el enlace lo generó creator_id al compartir su perfil).
      CREATE TABLE invite_links (
        token TEXT PRIMARY KEY,
        creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        target_id INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE (creator_id, kind, target_id)
      );
    `,
  },
  {
    version: 7,
    name: 'visibilidad del perfil',
    sql: `
      -- 0 = solo amigos (por defecto), 1 = público (cualquiera puede verlo, también sin cuenta).
      -- Quien ya tenía activado el enlace para compartir pasa a perfil público.
      ALTER TABLE users ADD COLUMN profile_public INTEGER NOT NULL DEFAULT 0;
      UPDATE users SET profile_public = share_enabled;
    `,
  },
  {
    version: 8,
    name: 'ciclo de vida de las listas conjuntas',
    sql: `
      -- La pareja se guarda aparte de los miembros: así «vuestra lista» se encuentra aunque alguien haya salido.
      ALTER TABLE joint_lists ADD COLUMN user_a INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE joint_lists ADD COLUMN user_b INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE joint_lists ADD COLUMN last_activity_at TEXT;
      -- left_at NULL = es miembro activo; con fecha = ha salido (la lista se conserva).
      ALTER TABLE joint_list_members ADD COLUMN left_at TEXT;
      UPDATE joint_lists SET
        user_a = COALESCE((SELECT MIN(user_id) FROM joint_list_members m WHERE m.list_id = joint_lists.id), 0),
        user_b = COALESCE((SELECT MAX(user_id) FROM joint_list_members m WHERE m.list_id = joint_lists.id), 0),
        last_activity_at = COALESCE((SELECT MAX(created_at) FROM joint_list_history h WHERE h.list_id = joint_lists.id), created_at);
    `,
  },
  {
    version: 9,
    name: 'revisionado',
    sql: `
      -- prev_episodes: episodios de visionados anteriores (ya terminados); siguen contando en las estadísticas.
      -- rewatch: nº de veces que se ha vuelto a ver (>0 = «Reviendo» mientras no se finalice de nuevo).
      ALTER TABLE user_content ADD COLUMN prev_episodes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE user_content ADD COLUMN rewatch INTEGER NOT NULL DEFAULT 0;
    `,
  },
];
