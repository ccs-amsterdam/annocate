import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { UnitsCreateBodySchema, type UnitResponse, type UnitMeta } from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";

interface UnitRow {
  id: number;
  jobId: number;
  externalId: string;
  data: string;
  immutable: number;
  variables: string;
}

function toResponse(row: UnitRow): UnitResponse {
  return { id: row.id, externalId: row.externalId, data: JSON.parse(row.data), immutable: !!row.immutable };
}
function toMeta(row: UnitRow): UnitMeta {
  const hash = createHash("sha256").update(row.externalId).update(row.data).digest("hex").slice(0, 16);
  return { id: row.id, externalId: row.externalId, hash };
}

export function unitRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.get("/units", requireJobUser(db, "READ"), (c) => {
    const rows = db.prepare("SELECT * FROM units WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as UnitRow[];
    return c.json(rows.map(toMeta));
  });

  app.get("/units/:id", requireJobUser(db, "READ"), (c) => {
    const row = db
      .prepare("SELECT * FROM units WHERE jobId = ? AND id = ?")
      .get(c.get("jobId"), Number(c.req.param("id"))) as unknown as UnitRow | undefined;
    if (!row) return c.json({ error: "Unit not found" }, 404);
    return c.json(toResponse(row));
  });

  app.post("/units", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = UnitsCreateBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const created: UnitResponse[] = [];
    const insert = db.prepare("INSERT INTO units (jobId, externalId, data) VALUES (?, ?, ?)");
    const findExisting = db.prepare("SELECT * FROM units WHERE jobId = ? AND externalId = ?");
    const update = db.prepare("UPDATE units SET data = ? WHERE jobId = ? AND id = ?");

    for (const unit of parsed.data.units) {
      const existing = findExisting.get(jobId, unit.externalId) as unknown as UnitRow | undefined;
      if (existing) {
        if (existing.immutable) {
          return c.json({ error: `Unit '${unit.externalId}' is immutable and cannot be overwritten` }, 409);
        }
        if (!parsed.data.overwrite) {
          return c.json({ error: `Unit '${unit.externalId}' already exists (set overwrite: true to replace)` }, 409);
        }
        update.run(JSON.stringify(unit.data), jobId, existing.id);
        created.push(toResponse({ ...existing, data: JSON.stringify(unit.data) }));
      } else {
        insert.run(jobId, unit.externalId, JSON.stringify(unit.data));
        const row = db.prepare("SELECT * FROM units WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as unknown as UnitRow;
        created.push(toResponse(row));
      }
    }
    return c.json(created, 201);
  });

  app.delete("/units/:id", requireJobUser(db, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const id = Number(c.req.param("id"));
    const existing = db.prepare("SELECT * FROM units WHERE jobId = ? AND id = ?").get(jobId, id) as
      | UnitRow
      | undefined;
    if (!existing) return c.json({ error: "Unit not found" }, 404);
    if (existing.immutable) return c.json({ error: "Unit is immutable and cannot be deleted" }, 409);

    db.prepare("DELETE FROM units WHERE jobId = ? AND id = ?").run(jobId, id);
    return c.body(null, 204);
  });

  return app;
}
