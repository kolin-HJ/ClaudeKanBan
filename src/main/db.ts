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
    { version: 1, sql: migration001 },
    { version: 2, sql: migration002 },
    { version: 3, sql: migration003 },
    { version: 4, sql: migration004 }
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

// migration002: Session tracking + mempalace fields + memory links
const migration002 = `
  -- Per-session usage tracking
  CREATE TABLE IF NOT EXISTS sessions (
    id                 TEXT PRIMARY KEY,
    task_id            TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    started_at         TEXT DEFAULT (datetime('now')),
    ended_at           TEXT,
    status             TEXT DEFAULT 'running'
                         CHECK(status IN ('running','completed','error','terminated')),
    input_tokens       INTEGER DEFAULT 0,
    output_tokens      INTEGER DEFAULT 0,
    cache_read_tokens  INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    total_cost_usd     REAL DEFAULT 0.0,
    duration_secs      INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);

  -- Tool usage events within a session
  CREATE TABLE IF NOT EXISTS tool_usage (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tool_name  TEXT NOT NULL,
    input_json TEXT,
    timestamp  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tool_usage_session ON tool_usage(session_id);

  -- Context events (files read, searches, etc.)
  CREATE TABLE IF NOT EXISTS context_events (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    target      TEXT,
    timestamp   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_context_events_session ON context_events(session_id);

  -- Session insights generated at session end
  CREATE TABLE IF NOT EXISTS session_insights (
    id                 TEXT PRIMARY KEY,
    session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id            TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    token_input        INTEGER DEFAULT 0,
    token_output       INTEGER DEFAULT 0,
    cost_usd           REAL DEFAULT 0.0,
    duration_secs      INTEGER DEFAULT 0,
    tools_json         TEXT,
    files_read_json    TEXT,
    files_created_json TEXT,
    learnings_json     TEXT,
    summary            TEXT,
    created_at         TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_insights_project ON session_insights(project_id, created_at);

  -- Per-project skill configuration
  CREATE TABLE IF NOT EXISTS project_skills (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    skill_path  TEXT NOT NULL,
    active      INTEGER DEFAULT 1,
    priority    INTEGER DEFAULT 0,
    UNIQUE(project_id, skill_path)
  );

  CREATE INDEX IF NOT EXISTS idx_project_skills ON project_skills(project_id, active);

  -- App settings stored in DB
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Session checkpoints for time-travel / replay
  CREATE TABLE IF NOT EXISTS session_checkpoints (
    id                TEXT PRIMARY KEY,
    session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    input_tokens      INTEGER DEFAULT 0,
    output_tokens     INTEGER DEFAULT 0,
    tools_used_json   TEXT,
    files_created_json TEXT,
    files_read_json   TEXT,
    security_flags_json TEXT,
    created_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON session_checkpoints(session_id, created_at);

  -- Security posture scores per session
  CREATE TABLE IF NOT EXISTS security_scores (
    id                   TEXT PRIMARY KEY,
    session_id           TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    score                INTEGER DEFAULT 100,
    flags_json           TEXT,
    dangerous_tool_count INTEGER DEFAULT 0,
    created_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_security_project ON security_scores(project_id, created_at);

  -- Mempalace fields: room (topic domain), layer (injection priority 0-3),
  -- verbatim (raw source text), reference_count, and memory_links (tunnels between memories)
  ALTER TABLE memories ADD COLUMN room TEXT;
  ALTER TABLE memories ADD COLUMN layer INTEGER NOT NULL DEFAULT 2;
  ALTER TABLE memories ADD COLUMN verbatim TEXT;
  ALTER TABLE memories ADD COLUMN reference_count INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE IF NOT EXISTS memory_links (
    id           TEXT PRIMARY KEY,
    source_id    TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id    TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL DEFAULT 'related'
                 CHECK(relationship IN ('related','contradicts','extends','supersedes')),
    created_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, target_id)
  );

  CREATE INDEX IF NOT EXISTS idx_memory_links_source ON memory_links(source_id);
  CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links(target_id);
  CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(project_id, layer, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_memories_room ON memories(project_id, room, deleted_at);
`

const migration003 = `
  -- Link local tasks to Asana tasks
  ALTER TABLE tasks ADD COLUMN asana_gid TEXT;
  ALTER TABLE tasks ADD COLUMN asana_permalink TEXT;
`

const migration004 = `
  -- MemPalace: Spatial memory hierarchy (wings/rooms/halls/drawers)
  -- Adds palace columns to existing memories table
  ALTER TABLE memories ADD COLUMN wing TEXT;
  ALTER TABLE memories ADD COLUMN hall TEXT CHECK(hall IS NULL OR hall IN (
    'hall_facts','hall_events','hall_discoveries','hall_preferences','hall_advice'
  ));
  ALTER TABLE memories ADD COLUMN importance REAL DEFAULT 1.0;
  ALTER TABLE memories ADD COLUMN added_by TEXT DEFAULT 'user';

  CREATE INDEX IF NOT EXISTS idx_memories_wing ON memories(wing, room);
  CREATE INDEX IF NOT EXISTS idx_memories_hall ON memories(hall);

  -- Knowledge Graph: Entity-Relationship triples with temporal validity
  CREATE TABLE IF NOT EXISTS kg_entities (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    entity_type   TEXT NOT NULL CHECK(entity_type IN ('person','project','concept','technology','file','service')),
    properties    TEXT, -- JSON
    created_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(name, entity_type)
  );

  CREATE TABLE IF NOT EXISTS kg_triples (
    id              TEXT PRIMARY KEY,
    subject         TEXT NOT NULL,
    predicate       TEXT NOT NULL,
    object          TEXT NOT NULL,
    valid_from      TEXT DEFAULT (datetime('now')),
    valid_to        TEXT, -- NULL = still current
    confidence      REAL DEFAULT 1.0,
    source_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
    source_file     TEXT,
    extracted_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_kg_subject ON kg_triples(subject, valid_to);
  CREATE INDEX IF NOT EXISTS idx_kg_object ON kg_triples(object, valid_to);
  CREATE INDEX IF NOT EXISTS idx_kg_predicate ON kg_triples(predicate);

  -- Agent Diary: Per-agent session journals
  CREATE TABLE IF NOT EXISTS agent_diary (
    id          TEXT PRIMARY KEY,
    session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_name  TEXT NOT NULL DEFAULT 'claude',
    topic       TEXT DEFAULT 'general',
    content     TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_diary_project ON agent_diary(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_diary_agent ON agent_diary(agent_name, created_at);

  -- Identity: Per-project identity text (L0 layer)
  CREATE TABLE IF NOT EXISTS palace_identity (
    project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TEXT DEFAULT (datetime('now'))
  );
`
