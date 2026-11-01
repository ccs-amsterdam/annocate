import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { draftUnits, removeUnit, toUnitResponse } from "../shared/units.js";

export function unit(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const get = async (jobId: number, id: number) => (await draftUnits(db, "u.job_id = $1 AND u.id = $2", [jobId, id]))[0];

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
    await removeUnit(db, jobId, id);
    return c.body(null, 204);
  });

  return app;
}
