import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

// Loaded via createRequire rather than a static `import ... from
// "node:sqlite"`: this Node version doesn't list `sqlite` in its public
// builtinModules (it's a newer, still-experimental builtin), which trips up
// Vite/Vitest's import resolution (used to transform test files). A
// require() call is just an opaque string argument to bundlers/transformers,
// so it passes through untouched and resolves natively at runtime. See
// design plan §6/§7.
const { DatabaseSync: DatabaseSyncImpl } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

// Minimal typed wrapper around node:sqlite's DatabaseSync (Node >= 22, see
// design plan §6/§7 -- no better-sqlite3 dependency needed). Tables mirror
// the simplified data model in design plan §2: a single job per mock-server
// deployment (see routes/job.ts) with codebooks/units/unitsets/coders/invites
// scoped to it via jobId.
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

    CREATE TABLE IF NOT EXISTS annotations (
      jobId INTEGER NOT NULL,
      unitId INTEGER NOT NULL,
      coderId INTEGER NOT NULL,
      variables TEXT NOT NULL,
      updated TEXT NOT NULL,
      codebookId INTEGER,
      done INTEGER NOT NULL DEFAULT 0,
      doneAt TEXT,
      PRIMARY KEY (unitId, coderId)
    );

    CREATE TABLE IF NOT EXISTS deployments (
      jobId INTEGER PRIMARY KEY,
      codebookId INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
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
  addColumnIfMissing(db, "annotations", "codebookId", "INTEGER");
  addColumnIfMissing(db, "annotations", "doneAt", "TEXT");
  if (addColumnIfMissing(db, "annotations", "done", "INTEGER NOT NULL DEFAULT 0")) backfillDone(db);
  db.exec("CREATE INDEX IF NOT EXISTS annotations_done ON annotations (jobId, done, doneAt)");
  return db;
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/**
 * One-off for annotations written before `done` was stored: done if every
 * variable is (the job server's rule at the time), finished at their last
 * write -- the best guess left.
 */
function backfillDone(db: DatabaseSync): void {
  const rows = db.prepare("SELECT rowid, variables, updated FROM annotations").all() as {
    rowid: number;
    variables: string;
    updated: string;
  }[];
  const update = db.prepare("UPDATE annotations SET done = 1, doneAt = ? WHERE rowid = ?");
  for (const row of rows) {
    const values = Object.values(JSON.parse(row.variables) as Record<string, { done?: boolean }>);
    if (values.length > 0 && values.every((v) => v.done)) update.run(row.updated, row.rowid);
  }
}
