import pg from "pg";
import { openPglite, openPostgres, type Sql } from "../db.js";

// One database per test file, emptied before each test: a PGlite instance
// takes seconds to start. With TEST_DATABASE_URL, tests run against that
// Postgres server instead, in a schema per test worker (test files run in
// parallel), which is emptied the same way: use a scratch database.

let db: Promise<Sql> | undefined;

/** An empty database (all tables truncated, ids restarted). */
export async function emptyDb(): Promise<Sql> {
  const url = process.env.TEST_DATABASE_URL;
  const sql = await (db ??= url ? openTestSchema(url) : openPglite());
  const tables = await sql.query<{ name: string }>(
    "SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'",
  );
  await sql.query(`TRUNCATE ${tables.map((t) => `"${t.name}"`).join(", ")} RESTART IDENTITY CASCADE`);
  return sql;
}

async function openTestSchema(url: string): Promise<Sql> {
  const schema = `test_${process.env.VITEST_POOL_ID ?? process.pid}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await admin.end();
  return openPostgres(`${url}${url.includes("?") ? "&" : "?"}options=${encodeURIComponent(`-c search_path=${schema}`)}`);
}
