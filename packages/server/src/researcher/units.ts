import { Hono } from "hono";
import {
  UnitsCreateBodySchema,
  addedFields,
  checkUnitData,
  fieldUsage,
  type UnitData,
  type UnitField,
} from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { designVersionItems } from "../shared/designVersions.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { checkUnitUpload } from "../shared/limits.js";
import {
  draftUnits,
  getUnitFields,
  latestDesignVersion,
  saveUnits,
  setUnitFields,
  toUnitMeta,
  toUnitResponse,
  unitCount,
} from "../shared/units.js";

/**
 * The unit fields after an upload: the declared ones and the columns it
 * adds. The first upload (no units yet) takes its types from the values: of
 * the declared fields it keeps only those it lacks that the design uses,
 * and declared descriptions stay.
 */
async function uploadFields(
  db: Db,
  studyId: number,
  declared: UnitField[],
  units: { data: UnitData }[],
): Promise<{ fields: UnitField[] } | { error: string }> {
  let known = declared;
  if ((await unitCount(db, studyId)) === 0) {
    const latest = await latestDesignVersion(db, studyId);
    const used = latest ? fieldUsage(designVersionItems(latest)) : new Map();
    const given = new Set(units.flatMap((u) => Object.keys(u.data)));
    known = declared.filter((f) => used.has(f.name) && !given.has(f.name));
  }
  const added = addedFields(
    units.map((u) => u.data),
    known,
  );
  if ("error" in added) return added;
  const withDeclaredDescription = (f: UnitField) => {
    const description = declared.find((d) => d.name === f.name)?.description;
    return description ? { ...f, description } : f;
  };
  return { fields: [...known, ...added.fields.map(withDeclaredDescription)] };
}

export function units(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/units", requireStudyUser(server, "READ"), async (c) => {
    const rows = await draftUnits(db, c.get("studyId"));
    return c.json(rows.map(toUnitMeta));
  });

  // Into the draft (docs/architecture.md §8.4): coders get the units when they
  // are deployed. All or nothing: every unit must fit the design's unit
  // fields (§3), and existing units may only be replaced with `overwrite`.
  // New columns are added to the draft design's fields (units already stored
  // have no value for them); every declared field must be given (null for
  // empty). The first upload (no units yet) takes its types from the values,
  // and drops declared fields it lacks that the design doesn't use.
  app.post("/study/:studyId/units", requireStudyUser(server, "WRITE"), async (c) => {
    const parsed = UnitsCreateBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const studyId = c.get("studyId");
    const { overwrite, overwriteCoded } = parsed.data;

    const declared = await getUnitFields(db, studyId);
    const upload = await uploadFields(db, studyId, declared, parsed.data.units);
    if ("error" in upload) return c.json({ error: upload.error }, 400);
    const { fields } = upload;
    // Set columns aren't data (their cells are sets): an empty one given is left out
    const setFields = new Set(fields.filter((f) => f.type === "set").map((f) => f.name));
    const units = parsed.data.units.map((u) => ({
      ...u,
      data: Object.fromEntries(
        Object.entries(u.data).filter(([name, value]) => !(setFields.has(name) && value === null)),
      ),
    }));
    for (const unit of units) {
      const problem = checkUnitData(unit.data, fields);
      if (problem) return c.json({ error: `Unit '${unit.externalId}': ${problem}` }, 400);
    }

    const existingRows = await draftUnits(db, studyId, { externalIds: units.map((u) => u.externalId) });
    const existing = new Map(existingRows.map((row) => [row.externalId, row]));
    await checkUnitUpload(
      db,
      studyId,
      units,
      new Set(units.filter((u) => !existing.has(u.externalId)).map((u) => u.externalId)).size,
    );
    for (const unit of units) {
      const row = existing.get(unit.externalId);
      if (!row) continue;
      if (row.coded && !overwriteCoded) {
        return c.json(
          {
            error: `Unit '${unit.externalId}' was coded; replacing it needs overwriteCoded: true (its answers keep the version their coders saw)`,
          },
          409,
        );
      }
      if (!overwrite && !overwriteCoded) {
        return c.json({ error: `Unit '${unit.externalId}' already exists (set overwrite: true to replace)` }, 409);
      }
    }

    const created = await db.transaction(async (tx) => {
      if (JSON.stringify(fields) !== JSON.stringify(declared)) await setUnitFields(tx, studyId, fields);
      const ids = await saveUnits(tx, studyId, units);
      const rows = await draftUnits(tx, studyId, { ids: [...ids.values()] });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return units.map((u) => toUnitResponse(byId.get(ids.get(u.externalId)!)!));
    });
    return c.json(created, 201);
  });

  return app;
}
