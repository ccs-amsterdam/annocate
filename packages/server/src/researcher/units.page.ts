import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { listSetGroups } from "../shared/sets.js";
import { draftUnits, toUnitResponse, unitCount } from "../shared/units.js";

const MAX_PAGE = 200;

// Static path: mounted before units.$id.ts so `/study/:studyId/units/page` is not read as a unit id.
// A page of the draft's units with data: all by id, or one set's (`group`, `set`) in its order.
export function unitsPage(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/units/page", requireStudyUser(server, "READ"), async (c) => {
    const studyId = c.get("studyId");
    const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const group = c.req.query("group");
    const setName = c.req.query("set");

    if (!group || !setName) {
      const rows = await draftUnits(db, "u.study_id = $1", [studyId, limit, offset], "LIMIT $2 OFFSET $3");
      return c.json({ total: await unitCount(db, studyId), units: rows.map(toUnitResponse) });
    }
    const set = (await listSetGroups(db, studyId)).find((g) => g.name === group)?.sets.find((s) => s.name === setName);
    if (!set) return c.json({ error: `Set '${setName}' of group '${group}' not found` }, 404);
    const ids = set.unitIds.slice(offset, offset + limit);
    const rows = ids.length ? await draftUnits(db, "u.study_id = $1 AND u.id = ANY($2)", [studyId, ids]) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return c.json({
      total: set.unitIds.length,
      units: ids.flatMap((id) => (byId.has(id) ? [toUnitResponse(byId.get(id)!)] : [])),
    });
  });

  return app;
}
