import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
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

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
// Stored in the database file: a different schema.sql means a different version.
const SCHEMA_VERSION = parseInt(createHash("sha256").update(SCHEMA).digest("hex").slice(0, 7), 16);

/**
 * Opens the database, creating it from schema.sql. No migrations: if a
 * database file has an older schema, it is deleted and created anew (this
 * server is for development and tests only).
 */
export function openDb(path = ":memory:"): DatabaseSync {
  if (path !== ":memory:" && existsSync(path)) {
    const existing = new DatabaseSyncImpl(path);
    const { user_version } = existing.prepare("PRAGMA user_version").get() as { user_version: number };
    existing.close();
    if (user_version === SCHEMA_VERSION) return withForeignKeys(new DatabaseSyncImpl(path));
    console.log(`${path}: schema.sql changed, recreating the database`);
    for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
  }
  const db = withForeignKeys(new DatabaseSyncImpl(path));
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

function withForeignKeys(db: DatabaseSync): DatabaseSync {
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

/** Runs `fn` in a transaction: all of it or nothing. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** `?, ?, ?` for an `IN (...)` with n values. */
export const placeholders = (n: number) => Array(n).fill("?").join(", ");
