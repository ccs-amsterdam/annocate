import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

// Loaded via createRequire rather than a static `import ... from
// "node:sqlite"`: this Node version doesn't list `sqlite` in its public
// builtinModules (it's a newer, still-experimental builtin), which trips up
// Vite/Vitest's import resolution (used to transform test files). A
// require() call is just an opaque string argument to bundlers/transformers,
// so it passes through untouched and resolves natively at runtime. See
// docs/client.md §8.
const { DatabaseSync: DatabaseSyncImpl } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

// Minimal typed wrapper around node:sqlite's DatabaseSync (Node >= 22, no
// better-sqlite3 dependency needed). Hosts any number of jobs; codebooks,
// units, unitsets, coders, invites, annotations and deployments are scoped to
// a job via jobId.
export function createDb(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSyncImpl(path);
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_users (
      jobId INTEGER NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (jobId, email)
    );

    CREATE TABLE IF NOT EXISTS codebooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId INTEGER NOT NULL,
      name TEXT NOT NULL,
      items TEXT NOT NULL,
      created TEXT NOT NULL,
      immutable INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS unitsets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId INTEGER NOT NULL,
      name TEXT NOT NULL,
      unitIds TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId INTEGER NOT NULL,
      externalId TEXT NOT NULL,
      data TEXT NOT NULL,
      immutable INTEGER NOT NULL DEFAULT 0
    );

    -- One row per (unit, coder, variable). Rows are retired (retiredAt), not
    -- deleted; only live rows count, and only those must be unique.
    CREATE TABLE IF NOT EXISTS annotation_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId INTEGER NOT NULL,
      unitId INTEGER NOT NULL,
      coderId INTEGER NOT NULL,
      variable TEXT NOT NULL,
      value TEXT NOT NULL,
      codebookId INTEGER,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      retiredAt TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS annotation_values_live
      ON annotation_values (unitId, coderId, variable) WHERE retiredAt IS NULL;
    CREATE INDEX IF NOT EXISTS annotation_values_coder ON annotation_values (jobId, coderId, unitId);
    CREATE INDEX IF NOT EXISTS annotation_values_variable ON annotation_values (jobId, variable);

    CREATE TABLE IF NOT EXISTS deployments (
      jobId INTEGER PRIMARY KEY,
      codebookId INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      annotationEpoch INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL,
      updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId INTEGER NOT NULL,
      email TEXT,
      devKey TEXT UNIQUE NOT NULL,
      doneUnitIds TEXT NOT NULL DEFAULT '{}',
      variables TEXT NOT NULL DEFAULT '{}',
      assignments TEXT NOT NULL DEFAULT '{}',
      participantId TEXT
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId INTEGER NOT NULL,
      label TEXT NOT NULL,
      access TEXT NOT NULL, -- CoderInviteWrite.auth (column name predates the rename)
      secret TEXT NOT NULL UNIQUE,
      emails TEXT,
      maxUses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      variables TEXT NOT NULL DEFAULT '{}',
      participantId TEXT,
      participantFromUrl INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Columns added after the first release of a table: add them to existing
  // local dev databases too (CREATE TABLE IF NOT EXISTS leaves those alone).
  addColumnIfMissing(db, "coders", "assignments", "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, "invites", "emails", "TEXT");
  addColumnIfMissing(db, "invites", "maxUses", "INTEGER");
  addColumnIfMissing(db, "invites", "uses", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "invites", "variables", "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, "invites", "participantId", "TEXT");
  addColumnIfMissing(db, "invites", "participantFromUrl", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "coders", "participantId", "TEXT");
  addColumnIfMissing(db, "deployments", "annotationEpoch", "INTEGER NOT NULL DEFAULT 0");
  migrateAnnotationsTable(db);
  return db;
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/**
 * One-off: databases from before per-variable rows had one `annotations` row
 * per (unit, coder) with a JSON blob. Split them into `annotation_values`
 * and drop the old table.
 */
function migrateAnnotationsTable(db: DatabaseSync): void {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'annotations'").get()) return;
  const columns = (db.prepare("PRAGMA table_info(annotations)").all() as { name: string }[]).map((c) => c.name);
  const rows = db.prepare("SELECT * FROM annotations").all() as unknown as {
    jobId: number;
    unitId: number;
    coderId: number;
    variables: string;
    updated: string;
    codebookId?: number | null;
    doneAt?: string | null;
  }[];
  const insert = db.prepare(
    `INSERT INTO annotation_values (jobId, unitId, coderId, variable, value, codebookId, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    const created = (columns.includes("doneAt") && row.doneAt) || row.updated;
    for (const [variable, value] of Object.entries(JSON.parse(row.variables) as Record<string, unknown>)) {
      insert.run(row.jobId, row.unitId, row.coderId, variable, JSON.stringify(value), row.codebookId ?? null, created, row.updated);
    }
  }
  db.exec("DROP TABLE annotations");
}
