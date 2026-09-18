import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { CodebookWriteSchema, type CodebookResponse, type CodebookMeta } from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";

interface CodebookRow {
  id: number;
  jobId: number;
  name: string;
  items: string;
  created: string;
  immutable: number;
}

function toResponse(row: CodebookRow): CodebookResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    items: JSON.parse(row.items),
    created: new Date(row.created),
    immutable: !!row.immutable,
  };
}
function toMeta(row: CodebookRow): CodebookMeta {
  return { id: row.id, name: row.name, created: new Date(row.created), immutable: !!row.immutable };
}

export function codebookRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.get("/codebook", requireJobUser(db, "READ"), (c) => {
    const rows = db.prepare("SELECT * FROM codebooks WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as CodebookRow[];
    return c.json(rows.map(toMeta));
  });

  app.get("/codebook/:id", requireJobUser(db, "READ"), (c) => {
    const row = db
      .prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?")
      .get(c.get("jobId"), Number(c.req.param("id"))) as unknown as CodebookRow | undefined;
    if (!row) return c.json({ error: "Codebook not found" }, 404);
    return c.json(toResponse(row));
  });

  app.post("/codebook", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = CodebookWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const created = new Date().toISOString();
    db.prepare("INSERT INTO codebooks (jobId, name, items, created, immutable) VALUES (?, ?, ?, ?, 0)").run(
      jobId,
      parsed.data.name,
      JSON.stringify(parsed.data.items),
      created,
    );
    const row = db.prepare("SELECT * FROM codebooks WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as unknown as CodebookRow;
    return c.json(toResponse(row), 201);
  });

  app.put("/codebook/:id", requireJobUser(db, "WRITE"), async (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = db.prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, id) as
      | CodebookRow
      | undefined;
    if (!existing) return c.json({ error: "Codebook not found" }, 404);
    if (existing.immutable) return c.json({ error: "Codebook is immutable and cannot be edited" }, 409);

    const parsed = CodebookWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    db.prepare("UPDATE codebooks SET name = ?, items = ? WHERE jobId = ? AND id = ?").run(
      parsed.data.name,
      JSON.stringify(parsed.data.items),
      jobId,
      id,
    );
    const row = db.prepare("SELECT * FROM codebooks WHERE jobId = ? AND id = ?").get(jobId, id) as unknown as CodebookRow;
    return c.json(toResponse(row));
  });

  app.delete("/codebook/:id", requireJobUser(db, "WRITE"), (c) => {
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
