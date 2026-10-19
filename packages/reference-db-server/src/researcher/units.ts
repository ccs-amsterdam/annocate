import { Hono } from "hono";
import { UnitsCreateBodySchema, checkUnitData, fieldsOfUnits, type UnitField, type UnitResponse } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { transaction } from "../db.js";
import { getUnitFields, setUnitFields, toUnitMeta, toUnitResponse, unitCount, type UnitRow } from "../shared/units.js";

export function units(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/units", requireJobUser(db, "READ"), (c) => {
    const rows = db.prepare("SELECT * FROM units WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as UnitRow[];
    return c.json(rows.map(toUnitMeta));
  });

  // All or nothing: every unit must fit the job's fields (set by the first
  // upload), and existing units may only be replaced with `overwrite`.
  app.post("/job/:jobId/units", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = UnitsCreateBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const { units, overwrite } = parsed.data;

    let fields: UnitField[] = getUnitFields(db, jobId);
    const firstUpload = unitCount(db, jobId) === 0;
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
    const created = transaction(db, () => {
      if (firstUpload) setUnitFields(db, jobId, fields);
      const result: UnitResponse[] = [];
      for (const unit of units) {
        const data = JSON.stringify(unit.data);
        const row = existing.get(unit.externalId);
        if (row) {
          update.run(data, jobId, row.id);
          result.push(toUnitResponse({ ...row, data }));
        } else {
          const id = Number(insert.run(jobId, unit.externalId, data).lastInsertRowid);
          result.push({ id, externalId: unit.externalId, data: unit.data, immutable: false });
        }
      }
      return result;
    });
    return c.json(created, 201);
  });

  return app;
}
