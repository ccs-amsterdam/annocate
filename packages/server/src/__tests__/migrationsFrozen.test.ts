import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationsFolder } from "../db/index.js";

// Released migrations never change (docs/hosting.md, "Updating"): servers
// that ran them won't run them again, so an edit would never reach them. A
// schema change is a new migration (`pnpm db:generate`), added below once
// it is released.
const RELEASED: Record<string, string> = {
  "0000_init": "0eaeffd84d6288f2f060ba02c7f082639bfa0dc3deeda1a56dc0b826e43e7fbb",
  "0001_seed": "e8b3b20543337d7b22efe01b9edca8497bd5a909d0b6989beb46da142f714f33",
};

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("released migrations", () => {
  it("are unchanged", () => {
    for (const [tag, hash] of Object.entries(RELEASED))
      expect(sha256(join(migrationsFolder, `${tag}.sql`)), `${tag}.sql was edited`).toBe(hash);
  });

  it("come first in the journal, in order", () => {
    const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    const released = Object.keys(RELEASED);
    expect(journal.entries.slice(0, released.length).map((e) => e.tag)).toEqual(released);
  });
});
