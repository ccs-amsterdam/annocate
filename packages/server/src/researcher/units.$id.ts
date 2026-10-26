import { Hono } from "hono";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { setUnitFields, toUnitResponse, unitCount, type UnitRow } from "../shared/units.js";

export function unit(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const get = (jobId: number, id: number) => one<UnitRow>(db, "SELECT * FROM units WHERE job_id = $1 AND id = $2", [jobId, id]);

  app.get("/job/:jobId/units/:id", requireJobUser(db, "READ"), async (c) => {
    const row = await get(c.get("jobId"), Number(c.req.param("id")));
    if (!row) return c.json({ error: "Unit not found" }, 404);
    return c.json(toUnitResponse(row));
  });

  app.delete("/job/:jobId/units/:id", requireJobUser(db, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await get(jobId, id);
    if (!existing) return c.json({ error: "Unit not found" }, 404);
    if (existing.immutable) return c.json({ error: "Unit is immutable and cannot be deleted" }, 409);

    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM units WHERE job_id = $1 AND id = $2 AND NOT immutable", [jobId, id]);
      // No units left: the next upload sets the fields anew
      if ((await unitCount(tx, jobId)) === 0) await setUnitFields(tx, jobId, []);
    });
    return c.body(null, 204);
  });

  return app;
}
