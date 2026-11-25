// The benchmark's database: which one (the caller's Postgres, or a fresh
// PGlite directory), its size, and plain SQL on it (bench-seed.mjs).
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The database of this run: `DATABASE_URL` (Postgres; the benchmark adds
 * its studies to it, so give it a database of its own), or else a fresh
 * PGlite directory (`PGLITE_DIR`, or a temporary one removed afterwards).
 */
export function benchDatabase(env = process.env) {
  if (env.DATABASE_URL) return { kind: "postgres", url: env.DATABASE_URL, remove() {} };
  if (env.PGLITE_DIR) return { kind: "pglite", pgliteDir: env.PGLITE_DIR, remove() {} };
  const pgliteDir = mkdtempSync(join(tmpdir(), "annotinder-bench-"));
  return { kind: "pglite", pgliteDir, remove: () => rmSync(pgliteDir, { recursive: true, force: true }) };
}

/** The size of a directory's files (bytes). */
function directorySize(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(dir, entry.name);
    return total + (entry.isDirectory() ? directorySize(path) : statSync(path).size);
  }, 0);
}

/**
 * SQL on the database: `{ query(text, params) -> rows, close() }`. PGlite
 * is one process at a time: open it only while the server is stopped.
 */
export async function openSql(database) {
  if (database.kind === "postgres") {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    return { query: async (text, params) => (await client.query(text, params)).rows, close: () => client.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const client = await PGlite.create(database.pgliteDir);
  return { query: async (text, params) => (await client.query(text, params)).rows, close: () => client.close() };
}

const TABLE_SIZES = `
  SELECT relname AS "table", pg_total_relation_size(oid)::float8 AS bytes, reltuples::float8 AS rows
  FROM pg_class
  WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
  ORDER BY bytes DESC LIMIT 8`;

const MB = 1024 * 1024;
const megabytes = (bytes) => Number((Number(bytes) / MB).toFixed(1));

/** Postgres: the version, the database's size and its largest tables (with their indexes; rows as of the last ANALYZE). */
async function postgresFacts(database) {
  const sql = await openSql(database);
  try {
    await sql.query("ANALYZE");
    const [{ version }] = await sql.query("SHOW server_version");
    const [{ bytes }] = await sql.query("SELECT pg_database_size(current_database())::float8 AS bytes");
    const tables = await sql.query(TABLE_SIZES);
    return {
      kind: "postgres",
      version,
      sizeMB: megabytes(bytes),
      largestTables: tables.map((t) => ({ table: t.table, sizeMB: megabytes(t.bytes), rows: Math.max(0, t.rows) })),
    };
  } finally {
    await sql.close();
  }
}

/** What to record about the database after a run. PGlite (in use by the server): only its directory's size. */
export async function databaseFacts(database) {
  if (database.kind === "postgres") return postgresFacts(database);
  return { kind: "pglite", sizeMB: megabytes(directorySize(database.pgliteDir)) };
}
