import { Hono } from "hono";
import { CodebookWriteSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import type { CodebookRow } from "../shared/deployments.js";
import { toCodebookMeta, toCodebookResponse } from "../shared/codebooks.js";

export function codebooks(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/codebook", requireJobUser(db, "READ"), (c) => {
    const rows = db.prepare("SELECT * FROM codebooks WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as CodebookRow[];
    return c.json(rows.map(toCodebookMeta));
  });

  app.post("/job/:jobId/codebook", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = CodebookWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const created = new Date().toISOString();
    db.prepare("INSERT INTO codebooks (jobId, note, items, created, immutable) VALUES (?, ?, ?, ?, 0)").run(
      jobId,
      parsed.data.note ?? null,
      JSON.stringify(parsed.data.items),
      created,
    );
    const row = db.prepare("SELECT * FROM codebooks WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as unknown as CodebookRow;
    return c.json(toCodebookResponse(row), 201);
  });

  return app;
}
