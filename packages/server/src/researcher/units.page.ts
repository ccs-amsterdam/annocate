import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { placeholders } from "../db.js";
import { toUnitResponse, unitCount, type UnitRow } from "../shared/units.js";

const MAX_PAGE = 200;

// Static path: mounted before units.$id.ts so `/job/:jobId/units/page` is not read as a unit id.
// A page of units with data: all units by id, or one unitset's in its order.
export function unitsPage(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/units/page", requireJobUser(db, "READ"), (c) => {
    const jobId = c.get("jobId");
    const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const unitset = c.req.query("unitset");

    if (!unitset) {
      const rows = db
        .prepare("SELECT * FROM units WHERE jobId = ? ORDER BY id LIMIT ? OFFSET ?")
        .all(jobId, limit, offset) as unknown as UnitRow[];
      return c.json({ total: unitCount(db, jobId), units: rows.map(toUnitResponse) });
    }
    const set = db.prepare("SELECT unitIds FROM unitsets WHERE jobId = ? AND name = ?").get(jobId, unitset) as
      | { unitIds: string }
      | undefined;
    if (!set) return c.json({ error: `Unitset '${unitset}' not found` }, 404);
    const allIds = JSON.parse(set.unitIds) as number[];
    const ids = allIds.slice(offset, offset + limit);
    const rows = ids.length
      ? (db
          .prepare(`SELECT * FROM units WHERE jobId = ? AND id IN (${placeholders(ids.length)})`)
          .all(jobId, ...ids) as unknown as UnitRow[])
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return c.json({
      total: allIds.length,
      units: ids.flatMap((id) => (byId.has(id) ? [toUnitResponse(byId.get(id)!)] : [])),
    });
  });

  return app;
}
