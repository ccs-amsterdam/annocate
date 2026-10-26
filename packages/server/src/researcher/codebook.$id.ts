import { Hono } from "hono";
import { CodebookWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import type { CodebookRow } from "../shared/deployments.js";
import { toCodebookResponse } from "../shared/codebooks.js";

export function codebook(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/codebook/:id", requireJobUser(db, "READ"), (c) => {
    const row = db
      .prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?")
      .get(c.get("jobId"), Number(c.req.param("id"))) as unknown as CodebookRow | undefined;
    if (!row) return c.json({ error: "Codebook not found" }, 404);
    return c.json(toCodebookResponse(row));
  });

  app.put("/job/:jobId/codebook/:id", requireJobUser(db, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = db.prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, id) as
      | CodebookRow
      | undefined;
    if (!existing) return c.json({ error: "Codebook not found" }, 404);
    if (existing.immutable) return c.json({ error: "Codebook is immutable and cannot be edited" }, 409);

    const parsed = CodebookWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    db.prepare("UPDATE codebooks SET note = ?, items = ? WHERE jobId = ? AND id = ?").run(
      parsed.data.note ?? null,
      JSON.stringify(parsed.data.items),
      jobId,
      id,
    );
    const row = db.prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, id) as unknown as CodebookRow;
    return c.json(toCodebookResponse(row));
  });

  app.delete("/job/:jobId/codebook/:id", requireJobUser(db, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = db.prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, id) as
      | CodebookRow
      | undefined;
    if (!existing) return c.json({ error: "Codebook not found" }, 404);
    if (existing.immutable) return c.json({ error: "Codebook is immutable and cannot be deleted" }, 409);

    db.prepare("DELETE FROM codebooks WHERE jobId = ? AND id = ?").run(jobId, id);
    return c.body(null, 204);
  });

  return app;
}
