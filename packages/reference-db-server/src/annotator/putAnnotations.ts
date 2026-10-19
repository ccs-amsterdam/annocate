import type { Context } from "hono";
import { AnnotatorAnnotationBatchSchema } from "@annotinder/contracts";
import { upsertValues, type Store } from "../store.js";
import { parseBody } from "./parse.js";

/**
 * `POST /annotator/job/:jobId/annotations` (docs/api/annotator.md#putannotations).
 * The job server's buffered writes, applied in order: upsert a live value
 * per given variable, leave other variables alone. Writes for unknown units
 * or coders are skipped and reported, so they don't block the rest.
 */
export const putAnnotations = (store: Store) => async (c: Context) => {
  const body = await parseBody(c, AnnotatorAnnotationBatchSchema);
  if (!body) return c.json({ error: "Invalid body" }, 400);
  const rejected: { index: number; error: string }[] = [];
  body.annotations.forEach((a, index) => {
    if (!store.units.has(a.unitId)) return rejected.push({ index, error: "Unit not found" });
    if (!store.coders.some((x) => x.id === a.coderId)) return rejected.push({ index, error: "Coder not found" });
    // Stored as given, never refused: a `unitHash` other than the unit's
    // current hash means the coder saw older content.
    upsertValues(store, a.unitId, a.coderId, a.variables, { codebookId: a.codebookId, unitHash: a.unitHash });
  });
  return c.json({ rejected });
};
