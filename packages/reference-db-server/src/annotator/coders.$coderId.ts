import { Hono } from "hono";
import { AnnotatorCoderWriteSchema } from "@annotinder/contracts";
import type { Env, Server } from "../context.js";
import { parseBody } from "../shared/http.js";

/**
 * `PUT /annotator/job/:jobId/coders/:coderId` (docs/api/annotator.md#putcoder).
 * Full replace of the coder's coder-level values and loop assignments.
 */
export function putCoder(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.put("/", async (c) => {
    const body = await parseBody(c, AnnotatorCoderWriteSchema);
    if (!("data" in body)) return c.json({ error: "Invalid body" }, 400);
    const result = server.db
      .prepare("UPDATE coders SET variables = ?, assignments = ? WHERE jobId = ? AND id = ?")
      .run(
        JSON.stringify(body.data.variables),
        JSON.stringify(body.data.assignments),
        c.get("jobId"),
        Number(c.req.param("coderId")),
      );
    if (result.changes === 0) return c.json({ error: "Coder not found" }, 404);
    return c.body(null, 204);
  });
  return app;
}
