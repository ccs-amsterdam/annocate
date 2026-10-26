import { Hono } from "hono";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { toUnitResponse, unitCount, type UnitRow } from "../shared/units.js";

const MAX_PAGE = 200;

// Static path: mounted before units.$id.ts so `/job/:jobId/units/page` is not read as a unit id.
// A page of units with data: all units by id, or one unitset's in its order.
export function unitsPage(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/units/page", requireJobUser(server, "READ"), async (c) => {
    const jobId = c.get("jobId");
    const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const unitset = c.req.query("unitset");

    if (!unitset) {
      const rows = await db.query<UnitRow>("SELECT * FROM units WHERE job_id = $1 ORDER BY id LIMIT $2 OFFSET $3", [jobId, limit, offset]);
      return c.json({ total: await unitCount(db, jobId), units: rows.map(toUnitResponse) });
    }
    const set = await one<{ unit_ids: number[] }>(db, "SELECT unit_ids FROM unitsets WHERE job_id = $1 AND name = $2", [jobId, unitset]);
    if (!set) return c.json({ error: `Unitset '${unitset}' not found` }, 404);
    const ids = set.unit_ids.slice(offset, offset + limit);
    const rows = ids.length ? await db.query<UnitRow>("SELECT * FROM units WHERE job_id = $1 AND id = ANY($2)", [jobId, ids]) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return c.json({
      total: set.unit_ids.length,
      units: ids.flatMap((id) => (byId.has(id) ? [toUnitResponse(byId.get(id)!)] : [])),
    });
  });

  return app;
}
