import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { listSetGroups } from "../shared/sets.js";
import { draftUnits, toUnitResponse, unitCount } from "../shared/units.js";

const MAX_PAGE = 200;

// Static path: mounted before units.$id.ts so `/study/:studyId/units/page` is not read as a unit id.
// A page of the draft's units with data: all by id, or one set's (`column`, `set`) in its order.
export function unitsPage(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/units/page", requireStudyUser(server, "READ"), async (c) => {
    const studyId = c.get("studyId");
    const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const column = c.req.query("column");
    const setName = c.req.query("set");

    if (!column || !setName) {
      const rows = await draftUnits(db, studyId, { limit, offset });
      return c.json({ total: await unitCount(db, studyId), units: rows.map(toUnitResponse) });
    }
    const set = (await listSetGroups(db, studyId)).find((g) => g.name === column)?.sets.find((s) => s.name === setName);
    if (!set) return c.json({ error: `Set '${setName}' of column '${column}' not found` }, 404);
    const ids = set.unitIds.slice(offset, offset + limit);
    const rows = ids.length ? await draftUnits(db, studyId, { ids }) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return c.json({
      total: set.unitIds.length,
      units: ids.flatMap((id) => (byId.has(id) ? [toUnitResponse(byId.get(id)!)] : [])),
    });
  });

  return app;
}
