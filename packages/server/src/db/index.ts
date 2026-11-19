import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { SQL } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import * as schema from "./schema/index.js";

/**
 * The database: Postgres, through `pg` (a real server, `DATABASE_URL`) or
 * PGlite (Postgres compiled to WebAssembly, in process: tests and
 * development), both through Drizzle. Tables: ./schema. Migrations
 * (`migrations/`, made by `pnpm db:generate`) are applied when a database is
 * opened.
 *
 * `Db` is the database or a transaction (`db.transaction(async (tx) => ...)`):
 * functions take a `Db`, so they run inside a caller's transaction too.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** An open database. */
export type Database = Db & { close(): Promise<void> };

const options = { schema, casing: "snake_case" } as const;
const migrationsFolder = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** A PGlite database: in memory, or in a directory. */
export async function openPglite(dataDir?: string): Promise<Database> {
  const client = await PGlite.create(dataDir);
  const db = drizzlePglite({ client, ...options });
  await migratePglite(db, { migrationsFolder });
  return Object.assign(db as unknown as Db, { close: () => client.close() });
}

/** A Postgres server, e.g. `postgres://user:pass@host/annotinder`. */
export async function openPostgres(connectionString: string): Promise<Database> {
  // BIGINT (COUNT(*), BIGINT ids) as number; ours stay far below 2^53.
  pg.types.setTypeParser(pg.types.builtins.INT8, Number);
  // PGPOOL_MAX: connections per server process (default 20).
  const pool = new pg.Pool({ connectionString, max: Number(process.env.PGPOOL_MAX ?? 20) });
  // Migrations on one connection, under a lock: server processes starting together apply them once.
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(7130001)");
    await migratePg(drizzlePg({ client, ...options }), { migrationsFolder });
  } finally {
    await client.query("SELECT pg_advisory_unlock(7130001)").catch(() => {});
    client.release();
  }
  return Object.assign(drizzlePg({ client: pool, ...options }) as unknown as Db, { close: () => pool.end() });
}

const TIMESTAMP_TYPES = new Set([1114, 1184]); // TIMESTAMP, TIMESTAMPTZ

/**
 * The rows of a raw query (`sql` template), for what the query builder
 * doesn't say well. Columns come back as the query names them, JSONB parsed,
 * BIGINT as number and timestamps as Date (Drizzle's drivers leave timestamps
 * as text, for the schema's columns to parse; this does it from the result's
 * column types).
 */
export async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: Record<string, unknown>[]; fields: { name: string; dataTypeID: number }[] };
  const dates = result.fields.filter((f) => TIMESTAMP_TYPES.has(f.dataTypeID)).map((f) => f.name);
  if (dates.length > 0) {
    for (const row of result.rows) for (const name of dates) if (typeof row[name] === "string") row[name] = new Date(row[name]);
  }
  return result.rows as T[];
}

/** The first row of a raw query, if any. */
export async function row<T>(db: Db, query: SQL): Promise<T | undefined> {
  return (await rows<T>(db, query))[0];
}
