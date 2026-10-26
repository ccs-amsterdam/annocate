import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  UnitsetWriteSchema,
  unitsetMatchesSource,
  type UnitLoopItem,
} from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toUnitsetResponse, type UnitsetRow } from "../shared/unitsets.js";

/**
 * True if any codebook in this job has a unit_loop source that refers to
 * `unitsetName` (directly, or via a `{placeholder}` pattern like `part_{slot}`).
 */
function isReferencedByCodebook(db: DatabaseSync, jobId: number, unitsetName: string): boolean {
  const rows = db.prepare("SELECT items FROM codebooks WHERE jobId = ?").all(jobId) as { items: string }[];
  const references = (items: { type: string; units?: UnitLoopItem["units"]; children?: unknown[] }[]): boolean =>
    items.some((item) => {
      if (item.type === "unit_loop") {
        return (item.units ?? []).some((b) => b.sources.some((s) => unitsetMatchesSource(s.unitset, unitsetName)));
      }
      return item.type === "condition" && references((item.children ?? []) as typeof items);
    });
  return rows.some((row) => references(JSON.parse(row.items)));
}

export function unitset(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.put("/job/:jobId/unitsets/:id", requireJobUser(db, "WRITE"), async (c) => {
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
    return c.json(toUnitsetResponse(row));
  });

  app.delete("/job/:jobId/unitsets/:id", requireJobUser(db, "WRITE"), (c) => {
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
