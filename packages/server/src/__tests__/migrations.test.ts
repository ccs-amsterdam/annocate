import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../../migrations/", import.meta.url);
const sqlOf = (file: string) => readFileSync(new URL(file, dir), "utf8");
const files = readdirSync(dir)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

/** A database with the migrations before `version` applied. */
async function before(version: string): Promise<PGlite> {
  const db = await PGlite.create();
  for (const file of files.filter((f) => f < version)) await db.exec(sqlOf(file));
  return db;
}

describe("migration 0006 (unit assignment)", () => {
  it("carries the links' sign-in over to the study: required wins over optional", async () => {
    const db = await before("0006");
    await db.exec(`INSERT INTO studies (name) VALUES ('required'), ('emails'), ('optional'), ('off')`);
    await db.exec(`INSERT INTO links (study_id, label, secret, auth, emails) VALUES
      (1, 'a', 's1', 'optional', NULL), (1, 'b', 's2', 'required', NULL),
      (2, 'a', 's3', 'off', '["a@example.org"]'),
      (3, 'a', 's4', 'off', NULL), (3, 'b', 's5', 'optional', NULL),
      (4, 'a', 's6', 'off', NULL)`);
    await db.exec(sqlOf(files.find((f) => f.startsWith("0006"))!));
    const rows = await db.query<{ name: string; sign_in: string }>("SELECT name, sign_in FROM studies ORDER BY id");
    expect(rows.rows.map((r) => [r.name, r.sign_in])).toEqual([
      ["required", "required"],
      ["emails", "required"],
      ["optional", "optional"],
      ["off", "off"],
    ]);
    await db.close();
  }, 30_000); // PGlite starts in seconds, slower while other test files run
});
