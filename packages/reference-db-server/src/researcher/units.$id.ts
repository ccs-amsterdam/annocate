import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { setUnitFields, toUnitResponse, unitCount, type UnitRow } from "../shared/units.js";

export function unit(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/units/:id", requireJobUser(db, "READ"), (c) => {
    const row = db
      .prepare("SELECT * FROM units WHERE jobId = ? AND id = ?")
      .get(c.get("jobId"), Number(c.req.param("id"))) as unknown as UnitRow | undefined;
    if (!row) return c.json({ error: "Unit not found" }, 404);
    return c.json(toUnitResponse(row));
  });

  app.delete("/job/:jobId/units/:id", requireJobUser(db, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = db.prepare("SELECT * FROM units WHERE jobId = ? AND id = ?").get(jobId, id) as
      | UnitRow
      | undefined;
    if (!existing) return c.json({ error: "Unit not found" }, 404);
    if (existing.immutable) return c.json({ error: "Unit is immutable and cannot be deleted" }, 409);

    db.prepare("DELETE FROM units WHERE jobId = ? AND id = ?").run(jobId, id);
    // No units left: the next upload sets the fields anew
    if (unitCount(db, jobId) === 0) setUnitFields(db, jobId, []);
    return c.body(null, 204);
  });

  return app;
}
