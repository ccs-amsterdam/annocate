import { Hono } from "hono";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { DRAFT_UNITS, removeUnit, setUnitFields, toUnitResponse, unitCount, type UnitRow } from "../shared/units.js";

export function unit(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const get = (jobId: number, id: number) => one<UnitRow>(db, `${DRAFT_UNITS} AND u.job_id = $1 AND u.id = $2`, [jobId, id]);

  app.get("/job/:jobId/units/:id", requireJobUser(server, "READ"), async (c) => {
    const row = await get(c.get("jobId"), Number(c.req.param("id")));
    if (!row) return c.json({ error: "Unit not found" }, 404);
    return c.json(toUnitResponse(row));
  });

  app.delete("/job/:jobId/units/:id", requireJobUser(server, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await get(jobId, id);
    if (!existing) return c.json({ error: "Unit not found" }, 404);
    // Out of the draft: deployed versions and answers keep it (docs/plans/design.md §5).
    await db.transaction(async (tx) => {
      await removeUnit(tx, jobId, id);
      // No units left: the next upload sets the fields anew
      if ((await unitCount(tx, jobId)) === 0) await setUnitFields(tx, jobId, []);
    });
    return c.body(null, 204);
  });

  return app;
}
