import type { Context } from "hono";
import { AnnotatorCoderWriteSchema } from "@annotinder/contracts";
import { isLive, upsertValues, type Store } from "../store.js";
import { parseBody } from "./parse.js";

/**
 * `PUT /annotator/job/:jobId/coders/:coderId` (docs/api/annotator.md#putcoder).
 * Full replace of the coder's coder-level values and loop assignments.
 */
export const putCoder = (store: Store) => async (c: Context) => {
  const body = await parseBody(c, AnnotatorCoderWriteSchema);
  if (!body) return c.json({ error: "Invalid body" }, 400);
  const coder = store.coders.find((x) => x.id === Number(c.req.param("coderId")));
  if (!coder) return c.json({ error: "Coder not found" }, 404);
  // Full replace: upsert the given values, retire the others.
  const now = new Date();
  for (const v of store.values) {
    if (isLive(v) && v.unitId === null && v.coderId === coder.id && !(v.variable in body.variables)) v.retiredAt = now;
  }
  upsertValues(store, null, coder.id, body.variables);
  coder.assignments = body.assignments;
  return c.body(null, 204);
};
