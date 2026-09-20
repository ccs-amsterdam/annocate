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
      immutable INTEGER NOT NULL DEFAULT 0,
      variables TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS coders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId INTEGER NOT NULL,
      email TEXT,
      devKey TEXT UNIQUE NOT NULL,
      doneUnitIds TEXT NOT NULL DEFAULT '{}',
      variables TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId INTEGER NOT NULL,
      label TEXT NOT NULL,
      access TEXT NOT NULL,
      secret TEXT NOT NULL UNIQUE
    );
  `);
  return db;
}
