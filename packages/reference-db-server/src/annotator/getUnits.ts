import type { Context } from "hono";
import type { Store } from "../store.js";

/**
 * `GET /annotator/job/:jobId/units?ids=1,2,3` (docs/api/annotator.md#getunits).
 * Unit content by id, with a content hash; unknown ids are left out.
 */
export const getUnits = (store: Store) => (c: Context) => {
  const ids = (c.req.query("ids") ?? "").split(",").map(Number);
  return c.json(ids.flatMap((id) => store.units.get(id) ?? []));
};
