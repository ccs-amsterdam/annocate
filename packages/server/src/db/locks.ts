import { sql } from "drizzle-orm";
import type { Db } from "./index.js";

// Locks that order what must not run at the same time: database advisory
// locks (across server processes) and a line per key within this process.

/** Waits for a database lock on `key`, held until the transaction ends. */
export async function advisoryLock(tx: Db, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}

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
