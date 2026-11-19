import { Hono } from "hono";
import {
  UnitsSpecSchema,
  fieldUsage,
  typeOfValue,
  unitFieldNameError,
  type UnitDataValue,
} from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { and, eq } from "drizzle-orm";
import { unitDraft, unitFieldNames, units, unitValues } from "../db/schema/index.js";
import { requireStudyUser } from "./auth.js";
import { designVersionItems } from "../shared/designVersions.js";
import { dropDraftFields, getUnitFields, latestDesignVersion, setUnitFields } from "../shared/units.js";

// The design's unit fields (docs/architecture.md §8.4).
// Static path: mounted before units.$id.ts so `/study/:studyId/units/fields` is not read as a unit id.
export function unitsFields(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/units/fields", requireStudyUser(server, "READ"), async (c) =>
    c.json(await getUnitFields(db, c.get("studyId"))),
  );

  // Declare, retype, describe, or remove fields. A removed field's values
  // leave the draft units (deployed versions keep them); a retyped field's
  // values must fit its new type.
  app.put("/study/:studyId/units/fields", requireStudyUser(server, "WRITE"), async (c) => {
    const parsed = UnitsSpecSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const studyId = c.get("studyId");
    const { fields } = parsed.data;
    const names = fields.map((f) => f.name);
    const twice = names.find((n, i) => names.indexOf(n) !== i);
    if (twice !== undefined) return c.json({ error: `Field '${twice}' is given twice` }, 400);
    const before = await getUnitFields(db, studyId);
    for (const f of fields) {
      const problem = before.some((b) => b.name === f.name) ? null : unitFieldNameError(f.name);
      if (problem) return c.json({ error: `Field name '${f.name}': ${problem}` }, 400);
    }

    const removed = before.filter((b) => !names.includes(b.name)).map((b) => b.name);
    const latest = await latestDesignVersion(db, studyId);
    const used = latest ? fieldUsage(designVersionItems(latest)) : new Map();
    const inUse = removed.filter((name) => used.has(name));
    if (inUse.length > 0) return c.json({ error: `The design uses ${inUse.join(", ")}: change it first` }, 409);

    // Retyped: every draft unit's value must fit
    for (const f of fields) {
      const old = before.find((b) => b.name === f.name);
      if (!old || old.type === f.type) continue;
      const rows = await db
        .select({ externalId: units.externalId, value: unitValues.value })
        .from(units)
        .innerJoin(unitDraft, eq(unitDraft.unitId, units.id))
        .innerJoin(unitFieldNames, eq(unitFieldNames.id, unitDraft.fieldId))
        .innerJoin(unitValues, eq(unitValues.id, unitDraft.valueId))
        .where(and(eq(units.studyId, studyId), eq(unitFieldNames.name, f.name)));
      const misfit = rows.find(
        (r) => typeOfValue(r.value as UnitDataValue) !== null && typeOfValue(r.value as UnitDataValue) !== f.type,
      );
      if (misfit)
        return c.json(
          { error: `Unit '${misfit.externalId}': its ${f.name} (${JSON.stringify(misfit.value)}) isn't ${f.type}` },
          400,
        );
    }

    await db.transaction(async (tx) => {
      await dropDraftFields(tx, studyId, removed);
      await setUnitFields(tx, studyId, fields);
    });
    return c.json(await getUnitFields(db, studyId));
  });

  return app;
}
