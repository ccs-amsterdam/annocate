import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import * as schema from "./schema/index.js";
import { MIGRATION_LOCK } from "./locks.js";

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
/** Postgres type ids of BIGINT[] and INTEGER[] (pg names only the scalar types). */
const INT8_ARRAY = 1016 as typeof pg.types.builtins.INT8;
const INT4_ARRAY = 1007 as typeof pg.types.builtins.INT8;
export const migrationsFolder = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** A PGlite database: in memory, or in a directory. */
export async function openPglite(dataDir?: string): Promise<Database> {
  const client = await PGlite.create(dataDir);
  const db = drizzlePglite({ client, ...options });
  await migratePglite(db, { migrationsFolder });
  return Object.assign(db as unknown as Db, { close: () => client.close() });
}

/**
 * How long the database lets one statement run, and a transaction sit idle
 * between statements, before it ends them: a stuck request then gives its
 * connection (and its locks) back. Work that takes longer lifts them for its
 * own transaction (`withoutTimeLimits`).
 */
export interface TimeLimits {
  statementMs: number;
  idleInTransactionMs: number;
}

export const DEFAULT_TIME_LIMITS: TimeLimits = { statementMs: 60_000, idleInTransactionMs: 60_000 };

/**
 * Lifts the time limits for the rest of the transaction `tx`: for the few
 * that are long by nature (exporting or importing a whole study).
 */
export async function withoutTimeLimits(tx: Db): Promise<void> {
  await tx.execute(sql`SET LOCAL statement_timeout = 0`);
  await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);
}

/** A Postgres server, e.g. `postgres://user:pass@host/annotinder`. */
export async function openPostgres(connectionString: string, limits = DEFAULT_TIME_LIMITS): Promise<Database> {
  // BIGINT (COUNT(*), BIGINT ids) as number, also in arrays (read as INTEGER[]); ours stay far below 2^53.
  pg.types.setTypeParser(pg.types.builtins.INT8, Number);
  pg.types.setTypeParser(INT8_ARRAY, pg.types.getTypeParser(INT4_ARRAY));
  // PGPOOL_MAX: connections per server process (default 20).
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX ?? 20),
    statement_timeout: limits.statementMs,
    idle_in_transaction_session_timeout: limits.idleInTransactionMs,
  });
  // A connection that breaks (the database restarts, a network drop, a time limit that ends it): the
  // pool drops it and opens new ones as needed. Without these listeners the error would end the
  // process. Idle in the pool:
  pool.on("error", (err) => console.error(`Database: lost an idle connection (${err.message})`));
  // In use between two statements (the next statement fails, and so does the request):
  pool.on("connect", (client) => {
    client.on("error", (err) => console.error(`Database: lost a connection (${err.message})`));
  });
  // Migrations on one connection, under a lock: server processes starting together apply them once.
  const client = await pool.connect();
  try {
    // Waiting for another process's migrations, and the migrations themselves, may take long
    await client.query("SET statement_timeout = 0");
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await migratePg(drizzlePg({ client, ...options }), { migrationsFolder });
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
  return Object.assign(drizzlePg({ client: pool, ...options }) as unknown as Db, { close: () => pool.end() });
}

/** Whether the database answers a query within `timeoutMs` (the readiness check, `GET /api/ready`). */
export async function databaseAnswers(db: Db, timeoutMs = 3000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const tooLate = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const answered = db.execute(sql`SELECT 1`).then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([answered, tooLate]);
  } finally {
    clearTimeout(timer);
  }
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
  const result = (await db.execute(query)) as unknown as {
    rows: Record<string, unknown>[];
    fields: { name: string; dataTypeID: number }[];
  };
  const dates = result.fields.filter((f) => TIMESTAMP_TYPES.has(f.dataTypeID)).map((f) => f.name);
  if (dates.length > 0) {
    for (const row of result.rows)
      for (const name of dates) if (typeof row[name] === "string") row[name] = new Date(row[name]);
  }
  return result.rows as T[];
}

/** The first row of a raw query, if any. */
export async function row<T>(db: Db, query: SQL): Promise<T | undefined> {
  return (await rows<T>(db, query))[0];
}
