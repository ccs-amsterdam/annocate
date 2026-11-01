import { Hono } from "hono";
import { UnitsSpecSchema, fieldUsage, typeOfValue, unitFieldNameError, type UnitDataValue } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { codebookItems } from "../shared/codebooks.js";
import { getUnitFields, latestCodebook, setUnitFields } from "../shared/units.js";

// The design's unit fields (docs/plans/design.md §3).
// Static path: mounted before units.$id.ts so `/job/:jobId/units/fields` is not read as a unit id.
export function unitsFields(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/units/fields", requireJobUser(server, "READ"), async (c) => c.json(await getUnitFields(db, c.get("jobId"))));

  // Declare, retype, describe, or remove fields. A removed field's values
  // leave the draft units (deployed versions keep them); a retyped field's
  // values must fit its new type.
  app.put("/job/:jobId/units/fields", requireJobUser(server, "WRITE"), async (c) => {
    const parsed = UnitsSpecSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const { fields } = parsed.data;
    const names = fields.map((f) => f.name);
    const twice = names.find((n, i) => names.indexOf(n) !== i);
    if (twice !== undefined) return c.json({ error: `Field '${twice}' is given twice` }, 400);
    const before = await getUnitFields(db, jobId);
    for (const f of fields) {
      const problem = before.some((b) => b.name === f.name) ? null : unitFieldNameError(f.name);
      if (problem) return c.json({ error: `Field name '${f.name}': ${problem}` }, 400);
    }

    const removed = before.filter((b) => !names.includes(b.name)).map((b) => b.name);
    const latest = await latestCodebook(db, jobId);
    const used = latest ? fieldUsage(codebookItems(latest)) : new Map();
    const inUse = removed.filter((name) => used.has(name));
    if (inUse.length > 0) return c.json({ error: `The codebook uses ${inUse.join(", ")}: change it first` }, 409);

    // Retyped: every draft unit's value must fit
    for (const f of fields) {
      const old = before.find((b) => b.name === f.name);
      if (!old || old.type === f.type) continue;
      const rows = await db.query<{ external_id: string; value: UnitDataValue }>(
        `SELECT u.external_id, val.value FROM units u JOIN unit_versions v ON v.id = u.version_id
         JOIN unit_values val ON val.id = (v.fields ->> $2)::int WHERE u.job_id = $1 AND v.fields ? $2`,
        [jobId, f.name],
      );
      const misfit = rows.find((r) => typeOfValue(r.value) !== null && typeOfValue(r.value) !== f.type);
      if (misfit) return c.json({ error: `Unit '${misfit.external_id}': its ${f.name} (${JSON.stringify(misfit.value)}) isn't ${f.type}` }, 400);
    }

    await db.transaction(async (tx) => {
      if (removed.length > 0) {
        // New draft versions without the removed fields
        await tx.query(
          `WITH changed AS (
             SELECT u.id AS unit_id, v.fields - $2::text[] AS fields
             FROM units u JOIN unit_versions v ON v.id = u.version_id WHERE u.job_id = $1 AND v.fields ?| $2::text[]
           ), versions AS (
             INSERT INTO unit_versions (job_id, unit_id, hash, fields)
             SELECT $1, unit_id, unit_content_hash(unit_data(fields)), fields FROM changed
             ON CONFLICT (unit_id, hash) DO UPDATE SET hash = excluded.hash RETURNING id, unit_id
           )
           UPDATE units u SET version_id = versions.id FROM versions WHERE u.id = versions.unit_id`,
          [jobId, removed],
        );
      }
      await setUnitFields(tx, jobId, fields);
    });
    return c.json(await getUnitFields(db, jobId));
  });

  return app;
}
