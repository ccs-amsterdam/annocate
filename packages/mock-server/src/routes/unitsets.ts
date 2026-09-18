import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { UnitsetWriteSchema, type UnitsetResponse, type CodebookItem } from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";

interface UnitsetRow {
  id: number;
  jobId: number;
  name: string;
  unitIds: string;
  order: string;
}

function toResponse(row: UnitsetRow): UnitsetResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    unitIds: JSON.parse(row.unitIds),
    order: row.order as UnitsetResponse["order"],
  };
}

/** True if any (non-deleted) codebook in this job has a unit_loop item referencing `unitsetName`. */
function isReferencedByCodebook(db: DatabaseSync, jobId: number, unitsetName: string): boolean {
  const rows = db.prepare("SELECT items FROM codebooks WHERE jobId = ?").all(jobId) as { items: string }[];
  return rows.some((row) => {
    const items = JSON.parse(row.items) as CodebookItem[];
    return items.some((item) => item.type === "unit_loop" && item.unitset === unitsetName);
  });
}

export function unitsetRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.get("/unitsets", requireJobUser(db, "READ"), (c) => {
    const rows = db.prepare("SELECT * FROM unitsets WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as
      UnitsetRow[];
    return c.json(rows.map(toResponse));
  });

  app.post("/unitsets", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = UnitsetWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    db.prepare('INSERT INTO unitsets (jobId, name, unitIds, "order") VALUES (?, ?, ?, ?)').run(
      jobId,
      parsed.data.name,
      JSON.stringify(parsed.data.unitIds),
      parsed.data.order,
    );
    const row = db.prepare("SELECT * FROM unitsets WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as
      UnitsetRow;
    return c.json(toResponse(row), 201);
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

    db.prepare('UPDATE unitsets SET name = ?, unitIds = ?, "order" = ? WHERE jobId = ? AND id = ?').run(
      parsed.data.name,
      JSON.stringify(parsed.data.unitIds),
      parsed.data.order,
      jobId,
      id,
    );
    const row = db.prepare("SELECT * FROM unitsets WHERE jobId = ? AND id = ?").get(jobId, id) as UnitsetRow;
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
