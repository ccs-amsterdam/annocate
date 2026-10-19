import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  UnitsCreateBodySchema,
  checkUnitData,
  fieldsOfUnits,
  type UnitField,
  type UnitMeta,
  type UnitResponse,
} from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireJobUser } from "../auth.js";
import { jobUnitFields, setJobUnitFields, unitHash } from "../db/units.js";

interface UnitRow {
  id: number;
  jobId: number;
  externalId: string;
  data: string;
  immutable: number;
}

const MAX_PAGE = 200;

function toResponse(row: UnitRow): UnitResponse {
  return { id: row.id, externalId: row.externalId, data: JSON.parse(row.data), immutable: !!row.immutable };
}
function toMeta(row: UnitRow): UnitMeta {
  return { id: row.id, externalId: row.externalId, hash: unitHash(row.externalId, row.data) };
}

export function unitRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();
  const unitCount = (jobId: number) =>
    (db.prepare("SELECT COUNT(*) AS n FROM units WHERE jobId = ?").get(jobId) as { n: number }).n;

  app.get("/units", requireJobUser(db, "READ"), (c) => {
    const rows = db.prepare("SELECT * FROM units WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as UnitRow[];
    return c.json(rows.map(toMeta));
  });

  // Static paths before /units/:id
  app.get("/units/fields", requireJobUser(db, "READ"), (c) => c.json(jobUnitFields(db, c.get("jobId"))));

  // A page of units with data: all units by id, or one unitset's in its order.
  app.get("/units/page", requireJobUser(db, "READ"), (c) => {
    const jobId = c.get("jobId");
    const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const unitset = c.req.query("unitset");

    if (!unitset) {
      const rows = db
        .prepare("SELECT * FROM units WHERE jobId = ? ORDER BY id LIMIT ? OFFSET ?")
        .all(jobId, limit, offset) as unknown as UnitRow[];
      return c.json({ total: unitCount(jobId), units: rows.map(toResponse) });
    }
    const set = db.prepare("SELECT unitIds FROM unitsets WHERE jobId = ? AND name = ?").get(jobId, unitset) as
      | { unitIds: string }
      | undefined;
    if (!set) return c.json({ error: `Unitset '${unitset}' not found` }, 404);
    const ids = (JSON.parse(set.unitIds) as number[]).slice(offset, offset + limit);
    const rows = ids.length
      ? (db
          .prepare(`SELECT * FROM units WHERE jobId = ? AND id IN (${ids.map(() => "?").join(",")})`)
          .all(jobId, ...ids) as unknown as UnitRow[])
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return c.json({
      total: (JSON.parse(set.unitIds) as number[]).length,
      units: ids.flatMap((id) => (byId.has(id) ? [toResponse(byId.get(id)!)] : [])),
    });
  });

  app.get("/units/:id", requireJobUser(db, "READ"), (c) => {
    const row = db
      .prepare("SELECT * FROM units WHERE jobId = ? AND id = ?")
      .get(c.get("jobId"), Number(c.req.param("id"))) as unknown as UnitRow | undefined;
    if (!row) return c.json({ error: "Unit not found" }, 404);
    return c.json(toResponse(row));
  });

  // All or nothing: every unit must fit the job's fields (set by the first
  // upload), and existing units may only be replaced with `overwrite`.
  app.post("/units", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = UnitsCreateBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const { units, overwrite } = parsed.data;

    let fields: UnitField[] = jobUnitFields(db, jobId);
    const firstUpload = unitCount(jobId) === 0;
    if (firstUpload) {
      const inferred = fieldsOfUnits(units.map((u) => u.data));
      if ("error" in inferred) return c.json({ error: inferred.error }, 400);
      fields = inferred.fields;
    }
    for (const unit of units) {
      const problem = checkUnitData(unit.data, fields);
      if (problem) return c.json({ error: `Unit '${unit.externalId}': ${problem}` }, 400);
    }

    const findExisting = db.prepare("SELECT * FROM units WHERE jobId = ? AND externalId = ?");
    const existing = new Map<string, UnitRow>();
    for (const unit of units) {
      const row = findExisting.get(jobId, unit.externalId) as unknown as UnitRow | undefined;
      if (!row) continue;
      if (row.immutable) return c.json({ error: `Unit '${unit.externalId}' is immutable and cannot be overwritten` }, 409);
      if (!overwrite) {
        return c.json({ error: `Unit '${unit.externalId}' already exists (set overwrite: true to replace)` }, 409);
      }
      existing.set(unit.externalId, row);
    }

    const insert = db.prepare("INSERT INTO units (jobId, externalId, data) VALUES (?, ?, ?)");
    const update = db.prepare("UPDATE units SET data = ? WHERE jobId = ? AND id = ?");
    const created: UnitResponse[] = [];
    db.exec("BEGIN");
    try {
      if (firstUpload) setJobUnitFields(db, jobId, fields);
      for (const unit of units) {
        const data = JSON.stringify(unit.data);
        const row = existing.get(unit.externalId);
        if (row) {
          update.run(data, jobId, row.id);
          created.push(toResponse({ ...row, data }));
        } else {
          const id = Number(insert.run(jobId, unit.externalId, data).lastInsertRowid);
          created.push({ id, externalId: unit.externalId, data: unit.data, immutable: false });
        }
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
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
    // No units left: the next upload sets the fields anew
    if (unitCount(jobId) === 0) setJobUnitFields(db, jobId, []);
    return c.body(null, 204);
  });

  return app;
}
