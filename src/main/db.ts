import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb(): void {
  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'app.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations()
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const applied = db
    .prepare('SELECT version FROM schema_versions ORDER BY version')
    .all() as { version: number }[]
  const appliedSet = new Set(applied.map((r) => r.version))

  const migrations: { version: number; sql: string }[] = [
    { version: 1, sql: migration001 }
  ]

  for (const migration of migrations) {
    if (!appliedSet.has(migration.version)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_versions (version) VALUES (?)').run(migration.version)
    }
  }
}

const migration001 = `
  CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    path          TEXT NOT NULL UNIQUE,
    github_remote TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'in-progress'
                  CHECK(status IN ('your-turn','in-progress','done')),
    depth       TEXT NOT NULL DEFAULT 'quick'
                  CHECK(depth IN ('quick','campaign','deep-build')),
    permission  TEXT NOT NULL DEFAULT 'default'
                  CHECK(permission IN ('default','full-auto')),
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id        TEXT PRIMARY KEY,
    task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    role      TEXT NOT NULL CHECK(role IN ('user','claude')),
    content   TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id, timestamp);

  CREATE TABLE IF NOT EXISTS outputs (
    id           TEXT PRIMARY KEY,
    task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_path    TEXT NOT NULL,
    file_name    TEXT NOT NULL,
    preview_text TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_outputs_task ON outputs(task_id, created_at);

  CREATE TABLE IF NOT EXISTS memories (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type            TEXT NOT NULL
                      CHECK(type IN ('project_context','task_learning','feedback','pattern','blocker')),
    category        TEXT
                      CHECK(category IN ('architecture','convention','debugging','performance','brand_voice','workflow','dependency')),
    content         TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'user_input'
                      CHECK(source IN ('user_input','claude_note','inferred')),
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    relevance_score REAL DEFAULT 1.0,
    deleted_at      TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    last_referenced TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id, deleted_at);

  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    category,
    type,
    content='memories',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS memories_fts_insert
  AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, category, type)
    VALUES (new.rowid, new.content, new.category, new.type);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_fts_update
  AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, category, type)
    VALUES ('delete', old.rowid, old.content, old.category, old.type);
    INSERT INTO memories_fts(rowid, content, category, type)
    VALUES (new.rowid, new.content, new.category, new.type);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_fts_delete
  AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, category, type)
    VALUES ('delete', old.rowid, old.content, old.category, old.type);
  END;
`
