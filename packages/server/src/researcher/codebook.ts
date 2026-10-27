import { Hono } from "hono";
import { CodebookWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toCodebookMeta, toCodebookResponse, type CodebookRow } from "../shared/codebooks.js";

export function codebooks(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/codebook", requireJobUser(server, "READ"), async (c) => {
    const rows = await db.query<CodebookRow>("SELECT * FROM codebooks WHERE job_id = $1 ORDER BY id", [c.get("jobId")]);
    return c.json(rows.map(toCodebookMeta));
  });

  app.post("/job/:jobId/codebook", requireJobUser(server, "WRITE"), async (c) => {
    const parsed = CodebookWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const row = await one<CodebookRow>(
      db,
      "INSERT INTO codebooks (job_id, note, items, updated_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [c.get("jobId"), parsed.data.note ?? null, JSON.stringify(parsed.data.items), c.get("jobUser")?.email ?? null],
    );
    return c.json(toCodebookResponse(row!), 201);
  });

  return app;
}
