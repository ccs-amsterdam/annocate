import { Hono } from "hono";
import { FinishedRequestSchema } from "@annotinder/contracts";
import type { Env, Server } from "../context.js";
import { listFinished as listFinishedUnits } from "../shared/finished.js";
import { parseBody } from "../shared/http.js";

/**
 * `POST /annotator/job/:jobId/finished` (docs/api/annotator.md#listfinished).
 * Per group of variables: the (unit, coder) pairs -- or, for coder-level
 * groups, the coders -- where every variable has a live value ("finished"),
 * oldest first. Filtering only; the job server decides the groups and does
 * the counting.
 */
export function listFinished(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.post("/", async (c) => {
    const body = await parseBody(c, FinishedRequestSchema);
    if (!("data" in body)) return c.json({ error: body.error }, 400);
    return c.json(listFinishedUnits(server.db, c.get("jobId"), body.data));
  });
  return app;
}
