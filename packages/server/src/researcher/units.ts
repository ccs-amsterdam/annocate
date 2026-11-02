import { Hono } from "hono";
import { UnitsCreateBodySchema, addedFields, checkUnitData, fieldUsage, type UnitField } from "@annotinder/contracts";
import { designVersionItems } from "../shared/designVersions.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { checkUnitUpload } from "../shared/limits.js";
import { draftUnits, getUnitFields, latestDesignVersion, saveUnits, setUnitFields, toUnitMeta, toUnitResponse, unitCount } from "../shared/units.js";

export function units(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/units", requireJobUser(server, "READ"), async (c) => {
    const rows = await draftUnits(db, "u.job_id = $1", [c.get("jobId")]);
    return c.json(rows.map(toUnitMeta));
  });

  // Into the draft (docs/plans/design.md §5): coders get the units when they
  // are deployed. All or nothing: every unit must fit the design's unit
  // fields (§3), and existing units may only be replaced with `overwrite`.
  // New columns are added to the draft design's fields (units already stored
  // have no value for them); every declared field must be given (null for
  // empty). The first upload (no units yet) takes its types from the values,
  // and drops declared fields it lacks that the codebook doesn't use.
  app.post("/job/:jobId/units", requireJobUser(server, "WRITE"), async (c) => {
    const parsed = UnitsCreateBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const { units, overwrite, overwriteCoded } = parsed.data;

    const firstUpload = (await unitCount(db, jobId)) === 0;
    const declared = await getUnitFields(db, jobId);
    let known: UnitField[] = declared;
    if (firstUpload) {
      const latest = await latestDesignVersion(db, jobId);
      const used = latest ? fieldUsage(designVersionItems(latest)) : new Map();
      const given = new Set(units.flatMap((u) => Object.keys(u.data)));
      known = declared.filter((f) => used.has(f.name) && !given.has(f.name));
    }
    const added = addedFields(
      units.map((u) => u.data),
      known,
    );
    if ("error" in added) return c.json({ error: added.error }, 400);
    // The declared fields' descriptions stay when the first upload retypes them
    const describe = (f: UnitField) => {
      const d = declared.find((x) => x.name === f.name)?.description;
      return d ? { ...f, description: d } : f;
    };
    const fields = [...known, ...added.fields.map(describe)];
    for (const unit of units) {
      const problem = checkUnitData(unit.data, fields);
      if (problem) return c.json({ error: `Unit '${unit.externalId}': ${problem}` }, 400);
    }

    const existingRows = await draftUnits(db, "u.job_id = $1 AND u.external_id = ANY($2)", [
      jobId,
      units.map((u) => u.externalId),
    ]);
    const existing = new Map(existingRows.map((row) => [row.external_id, row]));
    await checkUnitUpload(db, jobId, units, new Set(units.filter((u) => !existing.has(u.externalId)).map((u) => u.externalId)).size);
    for (const unit of units) {
      const row = existing.get(unit.externalId);
      if (!row) continue;
      if (row.coded && !overwriteCoded) {
        return c.json(
          { error: `Unit '${unit.externalId}' was coded; replacing it needs overwriteCoded: true (its answers keep the version their coders saw)` },
          409,
        );
      }
      if (!overwrite && !overwriteCoded) {
        return c.json({ error: `Unit '${unit.externalId}' already exists (set overwrite: true to replace)` }, 409);
      }
    }

    const created = await db.transaction(async (tx) => {
      if (JSON.stringify(fields) !== JSON.stringify(declared)) await setUnitFields(tx, jobId, fields);
      const ids = await saveUnits(tx, jobId, units);
      const rows = await draftUnits(tx, "u.job_id = $1 AND u.id = ANY($2)", [jobId, [...ids.values()]]);
      const byId = new Map(rows.map((r) => [r.id, r]));
      return units.map((u) => toUnitResponse(byId.get(ids.get(u.externalId)!)!));
    });
    return c.json(created, 201);
  });

  return app;
}
