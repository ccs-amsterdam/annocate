import { Hono } from "hono";
import type { AnnotatorUnit } from "@annotinder/contracts";
import { placeholders } from "../db.js";
import type { Env, Server } from "../context.js";
import { unitHash } from "../shared/units.js";

/**
 * `GET /annotator/job/:jobId/units?ids=1,2,3` (docs/api/annotator.md#getunits).
 * Unit content by id, with a content hash; unknown ids are left out.
 */
export function getUnits(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", (c) => {
    const ids = (c.req.query("ids") ?? "")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return c.json([]);
    const rows = server.db
      .prepare(`SELECT id, externalId, data FROM units WHERE jobId = ? AND id IN (${placeholders(ids.length)})`)
      .all(c.get("jobId"), ...ids) as unknown as { id: number; externalId: string; data: string }[];
    const units: AnnotatorUnit[] = rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      data: JSON.parse(r.data),
      hash: unitHash(r.externalId, r.data),
    }));
    return c.json(units);
  });
  return app;
}
