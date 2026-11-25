import { afterEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { sql } from "drizzle-orm";
import { openPostgres, rows, withoutTimeLimits, type Database } from "../db/index.js";
import { postgresCode } from "../shared/http.js";

// The connection pool on a real Postgres (PGlite has no pool): run with
// TEST_DATABASE_URL, a scratch server. Skipped without it.

const url = process.env.TEST_DATABASE_URL;
const QUERY_CANCELED = "57014";
const IDLE_IN_TRANSACTION_TIMEOUT = "25P03";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A database of this file's own on the test server, with short time limits. */
async function openScratch(): Promise<Database> {
  const name = `annotinder_pool_test_${process.pid}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const own = new URL(url!);
  own.pathname = `/${name}`;
  return openPostgres(own.toString(), { statementMs: 300, idleInTransactionMs: 300 });
}

describe.skipIf(!url)("the connection pool", () => {
  let db: Database | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    await db?.close();
    db = undefined;
  });

  it("survives the database ending its idle connections, as a restart does", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db = await openScratch();
    await db.execute(sql`SELECT 1`); // a connection that is now idle in the pool
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname LIKE 'annotinder_pool_test_%' AND pid <> pg_backend_pid()",
    );
    await admin.end();
    // The pool hears of it (an unhandled "error" event would fail this test), and goes on with a new connection
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.stringContaining("lost an idle connection")));
    expect(await rows(db, sql`SELECT 1 AS one`)).toEqual([{ one: 1 }]);
  });

  it("ends a statement that runs too long, and a transaction that sits idle too long", async () => {
    db = await openScratch();
    const slow = await db.execute(sql`SELECT pg_sleep(2)`).catch((err: unknown) => err);
    expect(postgresCode(slow)).toBe(QUERY_CANCELED);

    const idle = await db
      .transaction(async (tx) => {
        await tx.execute(sql`SELECT 1`);
        await sleep(900);
        await tx.execute(sql`SELECT 1`);
      })
      .catch((err: unknown) => err);
    expect(idle).toBeInstanceOf(Error);
    expect([IDLE_IN_TRANSACTION_TIMEOUT, undefined]).toContain(postgresCode(idle)); // the connection is closed
    // The pool goes on
    expect(await rows(db, sql`SELECT 1 AS one`)).toEqual([{ one: 1 }]);
  });

  it("a transaction can lift the limits for itself, and only for itself", async () => {
    db = await openScratch();
    await db.transaction(async (tx) => {
      await withoutTimeLimits(tx);
      await tx.execute(sql`SELECT pg_sleep(0.6)`);
      await sleep(600);
      await tx.execute(sql`SELECT 1`);
    });
    // The pool gives the next statement the connection the transaction used
    const slow = await db.execute(sql`SELECT pg_sleep(2)`).catch((err: unknown) => err);
    expect(postgresCode(slow)).toBe(QUERY_CANCELED);
  });
});
