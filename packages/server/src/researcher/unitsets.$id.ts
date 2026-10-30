import { Hono } from "hono";
import {
  UnitsetWriteSchema,
  branchUnitsetNames,
  unitsetMatchesSource,
  type UnitLoopItem,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { foreignUnitIds, toUnitsetResponse, type UnitsetRow } from "../shared/unitsets.js";

/**
 * True if any codebook in this job has a unit_loop that refers to
 * `unitsetName` (directly, or via a `$var` pattern like `part_$var.slot.value`).
 */
async function isReferencedByCodebook(sql: Sql, jobId: number, unitsetName: string): Promise<boolean> {
  const rows = await sql.query<{ items: unknown }>("SELECT items FROM codebooks WHERE job_id = $1", [jobId]);
  const references = (items: { type: string; units?: UnitLoopItem["units"]; children?: unknown[] }[]): boolean =>
    items.some((item) => {
      if (item.type === "unit_loop") {
        return (item.units ?? []).some((b) => branchUnitsetNames(b).some((name) => unitsetMatchesSource(name, unitsetName)));
      }
      return item.type === "condition" && references((item.children ?? []) as typeof items);
    });
  return rows.some((row) => Array.isArray(row.items) && references(row.items as Parameters<typeof references>[0]));
}

export function unitset(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const get = (jobId: number, id: number) => one<UnitsetRow>(db, "SELECT * FROM unitsets WHERE job_id = $1 AND id = $2", [jobId, id]);

  app.put("/job/:jobId/unitsets/:id", requireJobUser(server, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await get(jobId, id);
    if (!existing) return c.json({ error: "Unitset not found" }, 404);

    const parsed = UnitsetWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const foreign = await foreignUnitIds(db, c.get("jobId"), parsed.data.unitIds);
    if (foreign.length > 0) return c.json({ error: `Not units of this job: ${foreign.slice(0, 10).join(", ")}` }, 400);

    const row = await one<UnitsetRow>(db, "UPDATE unitsets SET name = $1, unit_ids = $2 WHERE job_id = $3 AND id = $4 RETURNING *", [
      parsed.data.name,
      parsed.data.unitIds,
      jobId,
      id,
    ]);
    await server.deployments.refresh(jobId);
    return c.json(toUnitsetResponse(row!));
  });

  app.delete("/job/:jobId/unitsets/:id", requireJobUser(server, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await get(jobId, id);
    if (!existing) return c.json({ error: "Unitset not found" }, 404);
    if (await isReferencedByCodebook(db, jobId, existing.name)) {
      return c.json({ error: "Unitset is referenced by a codebook unit_loop and cannot be deleted" }, 409);
    }
    const invite = await one<{ label: string }>(db, "SELECT label FROM invites WHERE job_id = $1 AND unitset_id = $2 LIMIT 1", [jobId, id]);
    if (invite) return c.json({ error: `Unitset is the units of invitation "${invite.label}" and cannot be deleted` }, 409);

    await db.query("DELETE FROM unitsets WHERE job_id = $1 AND id = $2", [jobId, id]);
    await server.deployments.refresh(jobId);
    return c.body(null, 204);
  });

  return app;
}
