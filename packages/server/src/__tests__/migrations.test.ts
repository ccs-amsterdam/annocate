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

  it("the tables that grow with units, coders and answers have BIGINT ids, and so has what refers to them", async () => {
    const db = await openPglite();
    const columns = await query<{ at: string; type: string }>(
      db,
      `SELECT table_name || '.' || column_name AS at, data_type AS type FROM information_schema.columns
       WHERE table_schema = 'public'`,
    );
    const type = Object.fromEntries(columns.map((c) => [c.at, c.type]));
    for (const table of ["units", "unit_values", "unit_versions", "coder_sessions", "session_devices", "links"])
      expect([table, type[`${table}.id`]]).toEqual([table, "bigint"]);
    expect(type["design_versions.id"]).toBe("bigint");
    // Every column that refers to one of them (by its foreign key)
    const references = await query<{ at: string }>(
      db,
      `SELECT k.table_name || '.' || k.column_name AS at
       FROM information_schema.referential_constraints r
       JOIN information_schema.key_column_usage k ON k.constraint_name = r.constraint_name
       JOIN information_schema.key_column_usage p ON p.constraint_name = r.unique_constraint_name
       WHERE p.table_name IN ('units', 'unit_values', 'unit_versions', 'coder_sessions', 'session_devices', 'links', 'design_versions')`,
    );
    expect(references.length).toBeGreaterThan(15);
    for (const { at } of references) expect([at, type[at]]).toEqual([at, "bigint"]);
    expect(type["session_deletions.session_id"]).toBe("bigint");
    expect(type["studies.id"]).toBe("integer");
    await db.close();
  }, 30_000);

  it("what is always written can't be missing; emails are lowercase; the common paths have indexes", async () => {
    const db = await openPglite();
    const nullable = await query<{ at: string }>(
      db,
      `SELECT table_name || '.' || column_name AS at FROM information_schema.columns
       WHERE table_schema = 'public' AND is_nullable = 'YES'`,
    );
    const mayBeNull = new Set(nullable.map((c) => c.at));
    for (const at of [
      "coder_sessions.link_id",
      "coder_sessions.created",
      "links.created",
      "annotation_values.design_version_id",
      "deployment_versions.client_release",
      "deployment_versions.client_commit",
    ])
      expect([at, mayBeNull.has(at)]).toEqual([at, false]);
    // Null where it means something: a coder-level answer has no unit
    expect(mayBeNull.has("annotation_values.unit_id")).toBe(true);

    await expect(query(db, "INSERT INTO users (email) VALUES ('Anna@Example.com')")).rejects.toThrow();
    await query(db, "INSERT INTO users (email) VALUES ('anna@example.com')");

    const indexes = await query<{ name: string }>(db, "SELECT indexname AS name FROM pg_indexes");
    expect(indexes.map((i) => i.name)).toEqual(
      expect.arrayContaining([
        "unit_versions_study_current",
        "annotation_values_unit_version",
        "annotation_values_study",
        "annotation_values_design_version",
        "annotation_values_device",
        "unit_serves_unit_version",
        "unit_serves_unit",
        "unit_leases_session",
        "unit_leases_unit",
        "unit_codings_unit",
        "coder_sessions_link",
      ]),
    );
    await db.close();
  }, 30_000);

  it("an answer about a unit names the version of the unit the coder saw", async () => {
    const db = await openPglite();
    await query(db, "INSERT INTO studies (name, public_id) VALUES ('s', 'abcdefghijkl')");
    await query(db, "INSERT INTO design_versions (study_id, items) VALUES (1, '[]')");
    await query(db, "INSERT INTO links (study_id, label, secret) VALUES (1, 'l', 'x')");
    await query(db, "INSERT INTO coder_sessions (study_id, link_id) VALUES (1, 1)");
    await query(db, "INSERT INTO units (study_id, external_id) VALUES (1, 'u')");
    await query(db, "INSERT INTO unit_versions (study_id, unit_id, from_deploy) VALUES (1, 1, 1)");
    const insert = (unit: string, version: string) =>
      query(
        db,
        `INSERT INTO annotation_values (study_id, session_id, unit_id, unit_version_id, design_version_id, variable, value, created, updated)
         VALUES (1, 1, ${unit}, ${version}, 1, 'q', '{}', now(), now())`,
      );
    await expect(insert("1", "NULL")).rejects.toThrow();
    await insert("1", "1");
    await insert("NULL", "NULL");
    await db.close();
  }, 30_000);
});
