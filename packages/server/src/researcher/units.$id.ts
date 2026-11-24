import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { draftUnits, removeUnit, toUnitResponse } from "../shared/units.js";
import { idParam } from "../shared/request.js";

export function unit(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const findDraftUnit = async (studyId: number, id: number) => (await draftUnits(db, studyId, { ids: [id] }))[0];

  app.get("/study/:studyId/units/:id", requireStudyUser(server, "READ"), async (c) => {
    const row = await findDraftUnit(c.get("studyId"), idParam(c, "id"));
    if (!row) return c.json({ error: "Unit not found" }, 404);
    return c.json(toUnitResponse(row));
  });

  app.delete("/study/:studyId/units/:id", requireStudyUser(server, "WRITE"), async (c) => {
    const studyId = c.get("studyId");
    const id = idParam(c, "id");
    const existing = await findDraftUnit(studyId, id);
    if (!existing) return c.json({ error: "Unit not found" }, 404);
    // Out of the draft: deployed versions and answers keep it (docs/architecture.md §8.4).
    await db.transaction((tx) => removeUnit(tx, studyId, id));
    return c.body(null, 204);
  });

  return app;
}
