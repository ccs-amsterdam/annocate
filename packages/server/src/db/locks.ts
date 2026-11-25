import { sql } from "drizzle-orm";
import type { Db } from "./index.js";

// Locks that order what must not run at the same time: database advisory
// locks (across server processes) and a line per key within this process.

/** Waits for a database lock on `key`, held until the transaction ends. */
export async function advisoryLock(tx: Db, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}

/** The advisory lock key of a study's units (`lockUnits`). */
const UNITS_LOCK = 24026;

/**
 * Serializes a study's unit writes with its deploys (`write`), and answer
 * writes against them (`read`, shared): a deploy deletes versions nobody
 * answered and values nothing refers to, which a concurrent upload or
 * answer could be about to use. Held until the transaction ends: call it
 * inside one.
 */
export async function lockUnits(db: Db, studyId: number, mode: "write" | "read"): Promise<void> {
  await db.execute(
    mode === "write"
      ? sql`SELECT pg_advisory_xact_lock(${UNITS_LOCK}, ${studyId})`
      : sql`SELECT pg_advisory_xact_lock_shared(${UNITS_LOCK}, ${studyId})`,
  );
}

/** The advisory lock under which a starting server applies the migrations (`openPostgres`): one process at a time. */
export const MIGRATION_LOCK = 7130001;

/** Per database and key, the last call in line (`inTurn`). */
const lines = new WeakMap<Db, Map<string, Promise<unknown>>>();

/** Runs `fn` after earlier calls with the same key (on this database, in this process) have finished. */
export function inTurn<T>(db: Db, key: string, fn: () => Promise<T>): Promise<T> {
  let byKey = lines.get(db);
  if (!byKey) lines.set(db, (byKey = new Map()));
  const run = (byKey.get(key) ?? Promise.resolve()).then(fn);
  const last = run.catch(() => undefined);
  byKey.set(key, last);
  void last.then(() => {
    if (byKey.get(key) === last) byKey.delete(key);
  });
  return run;
}
