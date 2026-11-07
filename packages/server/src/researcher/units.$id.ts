import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { draftUnits, removeUnit, toUnitResponse } from "../shared/units.js";

export function unit(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  const get = async (studyId: number, id: number) => (await draftUnits(db, "u.study_id = $1 AND u.id = $2", [studyId, id]))[0];

  app.get("/study/:studyId/units/:id", requireStudyUser(server, "READ"), async (c) => {
    const row = await get(c.get("studyId"), Number(c.req.param("id")));
    if (!row) return c.json({ error: "Unit not found" }, 404);
    return c.json(toUnitResponse(row));
  });

  app.delete("/study/:studyId/units/:id", requireStudyUser(server, "WRITE"), async (c) => {
    const studyId = c.get("studyId");
    const id = Number(c.req.param("id"));
    const existing = await get(studyId, id);
    if (!existing) return c.json({ error: "Unit not found" }, 404);
    // Out of the draft: deployed versions and answers keep it (docs/plans/design.md §5).
    await db.transaction((tx) => removeUnit(tx, studyId, id));
    return c.body(null, 204);
  });

  return app;
}
