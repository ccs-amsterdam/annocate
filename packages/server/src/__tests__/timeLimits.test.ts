import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudyResponseSchema } from "@annotinder/contracts";
import { rows, type Db } from "../db/index.js";
import { createApp } from "../app.js";
import { ensureUser } from "../shared/accounts.js";
import { DiskFileStore } from "../shared/files.js";
import { ensureResultsExport } from "../shared/resultsExport.js";
import { exportStudy, importStudy } from "../shared/studyExport.js";
import { emptyDb } from "./testDb.js";

// The database ends statements that run too long (db/index.ts). Exporting
// and importing a whole study are long by nature: their transactions lift
// the limit for themselves.

let db: Db;
const headers = { "content-type": "application/json", "x-dev-role": "ADMIN" };

beforeEach(async () => {
  db = await emptyDb();
  // As the pool sets it for every connection
  await db.execute(sql`SET statement_timeout = '60s'`);
});
afterEach(async () => {
  await db.execute(sql`RESET statement_timeout`);
});

/** The database, noting the statement time limit each of its transactions ends with. */
function watched(): { db: Db; limits: string[] } {
  const limits: string[] = [];
  const transaction: Db["transaction"] = (work, config) =>
    db.transaction(async (tx) => {
      const done = await work(tx);
      const [shown] = await rows<{ statement_timeout: string }>(tx as unknown as Db, sql`SHOW statement_timeout`);
      limits.push(shown!.statement_timeout);
      return done;
    }, config);
  const watchedDb = new Proxy(db, {
    get: (target, key) => (key === "transaction" ? transaction : (Reflect.get(target, key) as unknown)),
  });
  return { db: watchedDb, limits };
}

async function exampleStudy(): Promise<number> {
  const app = createApp(db, { devMode: true });
  const res = await app.request("/api/study/from-example", {
    method: "POST",
    headers,
    body: JSON.stringify({ example: "swipe-sentiment" }),
  });
  return StudyResponseSchema.parse(await res.json()).id;
}

// Real exports and imports: slower than the default 5 s on a busy CI runner
describe("long transactions lift the statement time limit for themselves", { timeout: 60_000 }, () => {
  it("exporting a study, and importing one", async () => {
    const study = await exampleStudy();
    const out = watched();
    const { bytes } = await exportStudy(out.db, study);
    expect(out.limits).toEqual(["0"]);

    const owner = await ensureUser(db, "r@uni.nl");
    const into = watched();
    await into.db.transaction((tx) => importStudy(tx, bytes, { ownerId: owner.id, ownerIsAdmin: true }));
    expect(into.limits).toEqual(["0"]);
    // Only for those transactions
    expect(await rows(db, sql`SHOW statement_timeout`)).toEqual([{ statement_timeout: "1min" }]);
  });

  it("writing the results export", async () => {
    const study = await exampleStudy();
    const files = new DiskFileStore(await mkdtemp(join(tmpdir(), "annotinder-test-")));
    const { db: watchedDb, limits } = watched();
    await ensureResultsExport(watchedDb, files, study);
    expect(limits).toEqual(["0"]);
  });
});
