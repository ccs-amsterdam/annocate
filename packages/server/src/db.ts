import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

/**
 * The database: Postgres, through `pg` (a real server, `DATABASE_URL`) or
 * PGlite (Postgres compiled to WebAssembly, in process: tests and
 * development). Queries use `$1, $2, ...` parameters. JSONB columns come
 * back parsed, TIMESTAMPTZ as Date, BIGINT (e.g. `COUNT(*)`) as number.
 * JSONB parameters are passed as strings (`JSON.stringify`): `pg` would send
 * a JS array as a Postgres array.
 */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs `fn` in a transaction: all of it or nothing. Inside one, it just runs `fn`. */
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** The first row, if any. */
export async function one<T = Record<string, unknown>>(sql: Sql, text: string, params?: unknown[]): Promise<T | undefined> {
  return (await sql.query<T>(text, params))[0];
}

/** A PGlite database: in memory, or in a directory. */
export async function openPglite(dataDir?: string): Promise<Sql> {
  const db = await PGlite.create(dataDir);
  const sql = pgliteSql(db);
  await migrate(sql, (text) => db.exec(text).then(() => undefined));
  return sql;
}

type PgliteQueries = Pick<PGlite, "query">;

function pgliteSql(db: PGlite): Sql {
  const wrap = (q: PgliteQueries, inTransaction: boolean): Sql => ({
    query: async <T>(text: string, params?: unknown[]) => (await q.query<T>(text, params)).rows,
    transaction: (fn) => (inTransaction ? fn(wrap(q, true)) : db.transaction((tx) => fn(wrap(tx, true)))),
    close: () => db.close(),
  });
  return wrap(db, false);
}

/** A Postgres server, e.g. `postgres://user:pass@host/annotinder`. */
export async function openPostgres(connectionString: string): Promise<Sql> {
  // BIGINT (COUNT(*), BIGINT ids) as number; ours stay far below 2^53.
  pg.types.setTypeParser(pg.types.builtins.INT8, Number);
  const pool = new pg.Pool({ connectionString });
  const sql = postgresSql(pool);
  const c = await pool.connect();
  try {
    await migrate(sql, async (text) => {
      await c.query(text);
    });
  } finally {
    c.release();
  }
  return sql;
}

function postgresSql(pool: pg.Pool): Sql {
  const client = (c: pg.PoolClient): Sql => ({
    query: async <T>(text: string, params?: unknown[]) => (await c.query(text, params)).rows as T[],
    transaction: (fn) => fn(client(c)),
    close: async () => {},
  });
  return {
    query: async <T>(text: string, params?: unknown[]) => (await pool.query(text, params)).rows as T[],
    transaction: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const result = await fn(client(c));
        await c.query("COMMIT");
        return result;
      } catch (err) {
        await c.query("ROLLBACK");
        throw err;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

/**
 * Applies the migrations (`migrations/NNNN_name.sql`) the database doesn't
 * have yet, in order, each in a transaction.
 */
async function migrate(sql: Sql, exec: (text: string) => Promise<void>): Promise<void> {
  await sql.query("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied TIMESTAMPTZ NOT NULL DEFAULT now())");
  const applied = new Set((await sql.query<{ version: number }>("SELECT version FROM schema_migrations")).map((r) => r.version));
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = Number(file.slice(0, 4));
    if (applied.has(version)) continue;
    const text = readFileSync(new URL(file, MIGRATIONS_DIR), "utf8");
    // Multi-statement text: through `exec`, between our own BEGIN and COMMIT.
    try {
      await exec(`BEGIN;\n${text}\nINSERT INTO schema_migrations (version) VALUES (${version});\nCOMMIT;`);
    } catch (err) {
      await exec("ROLLBACK").catch(() => {});
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }
}
