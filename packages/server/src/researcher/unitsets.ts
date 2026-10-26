import { Hono } from "hono";
import { UnitsetWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toUnitsetResponse, type UnitsetRow } from "../shared/unitsets.js";

export function unitsets(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/unitsets", requireJobUser(db, "READ"), async (c) => {
    const rows = await db.query<UnitsetRow>("SELECT * FROM unitsets WHERE job_id = $1 ORDER BY id", [c.get("jobId")]);
    return c.json(rows.map(toUnitsetResponse));
  });

  app.post("/job/:jobId/unitsets", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = UnitsetWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const row = await one<UnitsetRow>(db, "INSERT INTO unitsets (job_id, name, unit_ids) VALUES ($1, $2, $3) RETURNING *", [
      c.get("jobId"),
      parsed.data.name,
      parsed.data.unitIds,
    ]);
    return c.json(toUnitsetResponse(row!), 201);
  });

  return app;
}
