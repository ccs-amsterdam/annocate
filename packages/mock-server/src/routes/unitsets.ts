import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  ALL_UNITS_UNITSET,
  GenerateUnitsetsSchema,
  UnitsetWriteSchema,
  migrateLegacyUnitLoop,
  splitUnits,
  unitsetMatchesSource,
  type UnitsetResponse,
  type UnitLoopItem,
} from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";

interface UnitsetRow {
  id: number;
  jobId: number;
  name: string;
  unitIds: string;
}

function toResponse(row: UnitsetRow): UnitsetResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    unitIds: JSON.parse(row.unitIds),
  };
}

/**
 * True if any codebook in this job has a unit_loop source that refers to
 * `unitsetName` (directly, or via a `{placeholder}` pattern like `part_{slot}`).
 */
function isReferencedByCodebook(db: DatabaseSync, jobId: number, unitsetName: string): boolean {
  const rows = db.prepare("SELECT items FROM codebooks WHERE jobId = ?").all(jobId) as { items: string }[];
  const references = (items: unknown[]): boolean =>
    items.some((raw) => {
      const item = migrateLegacyUnitLoop(raw) as { type: string; children?: unknown[] } & Partial<UnitLoopItem>;
      if (item.type === "unit_loop") {
        return (item.units ?? []).some((b) => b.sources.some((s) => unitsetMatchesSource(s.unitset, unitsetName)));
      }
      return item.type === "condition" && references(item.children ?? []);
    });
  return rows.some((row) => references(JSON.parse(row.items)));
}

export function unitsetRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.get("/unitsets", requireJobUser(db, "READ"), (c) => {
    const rows = db.prepare("SELECT * FROM unitsets WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as UnitsetRow[];
    return c.json(rows.map(toResponse));
  });

  app.post("/unitsets", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = UnitsetWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    db.prepare("INSERT INTO unitsets (jobId, name, unitIds) VALUES (?, ?, ?)").run(
      jobId,
      parsed.data.name,
      JSON.stringify(parsed.data.unitIds),
    );
    const row = db.prepare("SELECT * FROM unitsets WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as unknown as UnitsetRow;
    return c.json(toResponse(row), 201);
  });

  // Splits units into `<prefix>_1..n` (+ `<prefix>_overlap`) as explicit
  // unitsets. Adding units to the job later doesn't change them.
  app.post("/unitsets/generate", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = GenerateUnitsetsSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const { prefix, from, ...options } = parsed.data;
    let unitIds: number[];
    if (!from || from === ALL_UNITS_UNITSET) {
      const rows = db.prepare("SELECT id FROM units WHERE jobId = ? ORDER BY id").all(jobId) as unknown as { id: number }[];
      unitIds = rows.map((r) => r.id);
    } else {
      const source = db.prepare("SELECT unitIds FROM unitsets WHERE jobId = ? AND name = ?").get(jobId, from) as
        | { unitIds: string }
        | undefined;
      if (!source) return c.json({ error: `Unitset '${from}' not found` }, 404);
      unitIds = JSON.parse(source.unitIds);
    }

    const { parts, overlap } = splitUnits(unitIds, options);
    const sets = parts.map((ids, i) => ({ name: `${prefix}_${i + 1}`, unitIds: ids }));
    if (overlap.length > 0) sets.push({ name: `${prefix}_overlap`, unitIds: overlap });

    const exists = db.prepare("SELECT 1 FROM unitsets WHERE jobId = ? AND name = ?");
    const taken = sets.find((set) => exists.get(jobId, set.name));
    if (taken) return c.json({ error: `Unitset '${taken.name}' already exists` }, 409);

    const insert = db.prepare("INSERT INTO unitsets (jobId, name, unitIds) VALUES (?, ?, ?)");
    for (const set of sets) insert.run(jobId, set.name, JSON.stringify(set.unitIds));
    const rows = db
      .prepare(`SELECT * FROM unitsets WHERE jobId = ? AND name IN (${sets.map(() => "?").join(",")}) ORDER BY id`)
      .all(jobId, ...sets.map((s) => s.name)) as unknown as UnitsetRow[];
    return c.json(rows.map(toResponse), 201);
  });

  app.put("/unitsets/:id", requireJobUser(db, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = db.prepare("SELECT * FROM unitsets WHERE jobId = ? AND id = ?").get(jobId, id) as
      | UnitsetRow
      | undefined;
    if (!existing) return c.json({ error: "Unitset not found" }, 404);

    const parsed = UnitsetWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    db.prepare("UPDATE unitsets SET name = ?, unitIds = ? WHERE jobId = ? AND id = ?").run(
      parsed.data.name,
      JSON.stringify(parsed.data.unitIds),
      jobId,
      id,
    );
    const row = db.prepare("SELECT * FROM unitsets WHERE jobId = ? AND id = ?").get(jobId, id) as unknown as UnitsetRow;
    return c.json(toResponse(row));
  });

  app.delete("/unitsets/:id", requireJobUser(db, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = db.prepare("SELECT * FROM unitsets WHERE jobId = ? AND id = ?").get(jobId, id) as
      | UnitsetRow
      | undefined;
    if (!existing) return c.json({ error: "Unitset not found" }, 404);
    if (isReferencedByCodebook(db, jobId, existing.name)) {
      return c.json({ error: "Unitset is referenced by a codebook unit_loop and cannot be deleted" }, 409);
    }

    db.prepare("DELETE FROM unitsets WHERE jobId = ? AND id = ?").run(jobId, id);
    return c.body(null, 204);
  });

  return app;
}
