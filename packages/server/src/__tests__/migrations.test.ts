import { describe, expect, it } from "vitest";
import { openPglite } from "../db/index.js";
import { query } from "./testDb.js";

describe("migrations", () => {
  it("apply to an empty database, once, with the seed rows", async () => {
    const db = await openPglite();
    const tables = await query<{ name: string }>(
      db,
      "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    expect(tables.map((t) => t.name)).toContain("annotation_values");
    expect(tables.length).toBe(33);
    expect(await query(db, "SELECT relpersistence FROM pg_class WHERE relname = 'rate_limits'")).toEqual([
      { relpersistence: "u" },
    ]);
    expect(await query(db, "SELECT name FROM plans")).toEqual([{ name: "Default" }]);
    expect(await query(db, "SELECT registration, default_plan_id AS plan FROM server_settings")).toEqual([
      { registration: { requests: true }, plan: 1 },
    ]);
    const applied = await query<{ n: number }>(db, "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
    await db.close();
    expect(applied[0]!.n).toBeGreaterThan(0);
  }, 30_000); // PGlite starts in seconds, slower while other test files run
});
