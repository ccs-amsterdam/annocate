import { Hono } from "hono";
import { UnitsetWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toUnitsetResponse, type UnitsetRow } from "../shared/unitsets.js";

export function unitsets(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/unitsets", requireJobUser(db, "READ"), (c) => {
    const rows = db.prepare("SELECT * FROM unitsets WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as UnitsetRow[];
    return c.json(rows.map(toUnitsetResponse));
  });

  app.post("/job/:jobId/unitsets", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = UnitsetWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    db.prepare("INSERT INTO unitsets (jobId, name, unitIds) VALUES (?, ?, ?)").run(
      jobId,
      parsed.data.name,
      JSON.stringify(parsed.data.unitIds),
    );
    const row = db.prepare("SELECT * FROM unitsets WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as unknown as UnitsetRow;
    return c.json(toUnitsetResponse(row), 201);
  });

  return app;
}
