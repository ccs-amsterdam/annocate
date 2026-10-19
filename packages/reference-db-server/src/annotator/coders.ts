import { Hono } from "hono";
import type { Env, Server } from "../context.js";
import { toAnnotatorCoder, type CoderRow } from "../shared/coders.js";

/**
 * `GET /annotator/job/:jobId/coders` (docs/api/annotator.md#listcoders).
 * All coders, with their coder-level values and loop assignments (no emails).
 * The job server only calls this for researcher status, on demand.
 */
export function listCoders(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", (c) => {
    const rows = server.db.prepare("SELECT * FROM coders WHERE jobId = ? ORDER BY id").all(c.get("jobId")) as unknown as CoderRow[];
    return c.json(rows.map((row) => toAnnotatorCoder(row)));
  });
  return app;
}
