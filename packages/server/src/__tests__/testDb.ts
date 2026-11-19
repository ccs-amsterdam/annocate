import pg from "pg";
import { sql, type SQL } from "drizzle-orm";
import { openPglite, openPostgres, rows, type Database, type Db } from "../db/index.js";

// One database per test file, emptied before each test: a PGlite instance
// takes seconds to start. With TEST_DATABASE_URL, tests run against that
// Postgres server instead, in a database per test worker (test files run in
// parallel), which is emptied the same way: use a scratch server.

let db: Promise<Database> | undefined;

/** An empty database (all tables truncated, ids restarted; the seed rows come back with `getSettings`). */
export async function emptyDb(): Promise<Database> {
  const url = process.env.TEST_DATABASE_URL;
  const database = await (db ??= url ? openTestDatabase(url) : openPglite());
  const tables = await query<{ name: string }>(
    database,
    "SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()",
  );
  await database.execute(sql.raw(`TRUNCATE ${tables.map((t) => `"${t.name}"`).join(", ")} RESTART IDENTITY CASCADE`));
  return database;
}

/** A database per test worker on the server at `url` (made if it isn't there), with the migrations applied. */
async function openTestDatabase(url: string): Promise<Database> {
  const name = `annotinder_test_${process.env.VITEST_POOL_ID ?? process.pid}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const own = new URL(url);
  own.pathname = `/${name}`;
  return openPostgres(own.toString());
}

/**
 * A raw query with `$1, $2, ...` parameters, for tests that set up or check
 * rows directly. Rows as `rows` (db/index.ts) gives them.
 */
export function query<T = Record<string, unknown>>(database: Db, text: string, params: unknown[] = []): Promise<T[]> {
  const parts: SQL[] = text
    .split(/\$(\d+)/)
    .map((part, i) => (i % 2 === 0 ? sql.raw(part) : sql`${sql.param(params[Number(part) - 1])}`));
  return rows<T>(database, sql.join(parts));
}
