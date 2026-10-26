import { Hono } from "hono";
import { UnitsCreateBodySchema, checkUnitData, fieldsOfUnits, type UnitField, type UnitResponse } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getUnitFields, setUnitFields, toUnitMeta, toUnitResponse, unitCount, type UnitRow } from "../shared/units.js";

export function units(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/units", requireJobUser(db, "READ"), async (c) => {
    const rows = await db.query<UnitRow>("SELECT * FROM units WHERE job_id = $1 ORDER BY id", [c.get("jobId")]);
    return c.json(rows.map(toUnitMeta));
  });

  // All or nothing: every unit must fit the job's fields (set by the first
  // upload), and existing units may only be replaced with `overwrite`.
  app.post("/job/:jobId/units", requireJobUser(db, "WRITE"), async (c) => {
    const parsed = UnitsCreateBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const { units, overwrite } = parsed.data;

    let fields: UnitField[] = await getUnitFields(db, jobId);
    const firstUpload = (await unitCount(db, jobId)) === 0;
    if (firstUpload) {
      const inferred = fieldsOfUnits(units.map((u) => u.data));
      if ("error" in inferred) return c.json({ error: inferred.error }, 400);
      fields = inferred.fields;
    }
    for (const unit of units) {
      const problem = checkUnitData(unit.data, fields);
      if (problem) return c.json({ error: `Unit '${unit.externalId}': ${problem}` }, 400);
    }

    const existingRows = await db.query<UnitRow>("SELECT * FROM units WHERE job_id = $1 AND external_id = ANY($2)", [
      jobId,
      units.map((u) => u.externalId),
    ]);
    const existing = new Map(existingRows.map((row) => [row.external_id, row]));
    for (const unit of units) {
      const row = existing.get(unit.externalId);
      if (!row) continue;
      if (row.immutable) return c.json({ error: `Unit '${unit.externalId}' is immutable and cannot be overwritten` }, 409);
      if (!overwrite) {
        return c.json({ error: `Unit '${unit.externalId}' already exists (set overwrite: true to replace)` }, 409);
      }
    }

    const created = await db.transaction(async (tx) => {
      if (firstUpload) await setUnitFields(tx, jobId, fields);
      const result: UnitResponse[] = [];
      for (const unit of units) {
        const data = JSON.stringify(unit.data);
        const row = existing.get(unit.externalId);
        const saved = row
          ? await one<UnitRow>(tx, "UPDATE units SET data = $1 WHERE job_id = $2 AND id = $3 RETURNING *", [data, jobId, row.id])
          : await one<UnitRow>(tx, "INSERT INTO units (job_id, external_id, data) VALUES ($1, $2, $3) RETURNING *", [
              jobId,
              unit.externalId,
              data,
            ]);
        result.push(toUnitResponse(saved!));
      }
      return result;
    });
    return c.json(created, 201);
  });

  return app;
}
