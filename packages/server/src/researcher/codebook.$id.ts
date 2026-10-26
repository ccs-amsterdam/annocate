import { Hono } from "hono";
import { CodebookWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toCodebookResponse, type CodebookRow } from "../shared/codebooks.js";

export function codebook(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const get = (jobId: number, id: number) => one<CodebookRow>(db, "SELECT * FROM codebooks WHERE job_id = $1 AND id = $2", [jobId, id]);

  app.get("/job/:jobId/codebook/:id", requireJobUser(db, "READ"), async (c) => {
    const row = await get(c.get("jobId"), Number(c.req.param("id")));
    if (!row) return c.json({ error: "Codebook not found" }, 404);
    return c.json(toCodebookResponse(row));
  });

  app.put("/job/:jobId/codebook/:id", requireJobUser(db, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await get(jobId, id);
    if (!existing) return c.json({ error: "Codebook not found" }, 404);
    if (existing.immutable) return c.json({ error: "Codebook is immutable and cannot be edited" }, 409);

    const parsed = CodebookWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const row = await one<CodebookRow>(
      db,
      "UPDATE codebooks SET note = $1, items = $2 WHERE job_id = $3 AND id = $4 AND NOT immutable RETURNING *",
      [parsed.data.note ?? null, JSON.stringify(parsed.data.items), jobId, id],
    );
    // Deployed meanwhile.
    if (!row) return c.json({ error: "Codebook is immutable and cannot be edited" }, 409);
    return c.json(toCodebookResponse(row));
  });

  app.delete("/job/:jobId/codebook/:id", requireJobUser(db, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = await get(jobId, id);
    if (!existing) return c.json({ error: "Codebook not found" }, 404);
    if (existing.immutable) return c.json({ error: "Codebook is immutable and cannot be deleted" }, 409);

    await db.query("DELETE FROM codebooks WHERE job_id = $1 AND id = $2 AND NOT immutable", [jobId, id]);
    return c.body(null, 204);
  });

  return app;
}
