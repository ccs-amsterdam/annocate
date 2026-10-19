import type { Context } from "hono";
import type { AnnotatorAnnotation } from "@annotinder/contracts";
import { isLive, type Store, type Value } from "../store.js";

/**
 * `GET /annotator/job/:jobId/annotations?coderId=X` (docs/api/annotator.md#listannotations).
 * One coder's live values per unit, ordered by first write. Coder-level
 * values are not included: they come with the coder.
 */
export const listAnnotations = (store: Store) => (c: Context) => {
  const coderId = Number(c.req.query("coderId"));
  if (!coderId) return c.json({ error: "coderId is required" }, 400);
  const byUnit = new Map<number, AnnotatorAnnotation>();
  for (const v of store.values.filter((v) => isLive(v) && v.coderId === coderId).sort(byCreated)) {
    if (v.unitId === null) continue;
    const a = byUnit.get(v.unitId) ?? { unitId: v.unitId, coderId, variables: {}, created: v.created, updated: v.updated };
    a.variables[v.variable] = v.value;
    if (v.updated > a.updated) a.updated = v.updated;
    byUnit.set(v.unitId, a);
  }
  return c.json([...byUnit.values()]);
};

const byCreated = (a: Value, b: Value) => a.created.getTime() - b.created.getTime();
