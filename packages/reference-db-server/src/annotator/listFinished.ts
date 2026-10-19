import type { Context } from "hono";
import { FinishedRequestSchema, type AnnotatorFinished } from "@annotinder/contracts";
import { isLive, type Store, type Value } from "../store.js";
import { parseBody } from "./parse.js";

/**
 * `POST /annotator/job/:jobId/finished` (docs/api/annotator.md#listfinished).
 * Per group of variables: the (unit, coder) pairs -- or, for coder-level
 * groups, the coders -- where every variable has a live value ("finished"),
 * oldest first. Filtering only; the job server decides the groups and does
 * the counting.
 */
export const listFinished = (store: Store) => async (c: Context) => {
  const body = await parseBody(c, FinishedRequestSchema);
  if (!body) return c.json({ error: "Invalid body" }, 400);
  const result: AnnotatorFinished[] = [];
  for (const group of body.loops) {
    const variables = new Set(group.variables);
    const coderLevel = group.level === "coder";
    const pairs = new Map<string, Value[]>();
    for (const v of store.values) {
      if (!isLive(v) || !variables.has(v.variable) || (v.unitId === null) !== coderLevel) continue;
      if (body.coderId !== undefined && v.coderId !== body.coderId) continue;
      const key = `${v.unitId}/${v.coderId}`;
      pairs.set(key, [...(pairs.get(key) ?? []), v]);
    }
    const finished = [...pairs.values()]
      .filter((values) => values.length === variables.size)
      .map((values) => ({ values, created: new Date(Math.min(...values.map((v) => v.created.getTime()))) }))
      .sort((a, b) => a.created.getTime() - b.created.getTime() || (a.values[0].unitId ?? 0) - (b.values[0].unitId ?? 0));
    for (const { values, created } of finished) {
      const { unitId, coderId } = values[0];
      const row: AnnotatorFinished = { loop: group.loop, unitId, coderId, created };
      // The values of e.g. agreement variables come along
      if (group.values?.length) {
        row.values = Object.fromEntries(
          store.values
            .filter((v) => isLive(v) && v.unitId === unitId && v.coderId === coderId && group.values!.includes(v.variable))
            .map((v) => [v.variable, v.value]),
        );
      }
      result.push(row);
    }
  }
  return c.json(result);
};
