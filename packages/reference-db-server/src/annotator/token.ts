import { Hono } from "hono";
import { JobTokenRequestSchema } from "@annotinder/contracts";
import type { Env, Server } from "../context.js";
import { boundJobServer } from "../shared/deployments.js";
import { parseBody } from "../shared/http.js";

/**
 * `POST /annotator/job/:jobId/token` (docs/api/annotator.md#requestjobtoken).
 * A job server asks for a job token with a request it signed with its own
 * key; the checks are in jobTokens.ts. The only call without a job token:
 * this is how a job server gets one.
 */
export function requestJobToken(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.post("/", async (c) => {
    const body = await parseBody(c, JobTokenRequestSchema);
    if (!("data" in body)) return c.json({ error: "Invalid body" }, 400);
    const jobId = Number(c.req.param("jobId"));
    // Only the job server the job is bound to gets a token
    const bound = Number.isInteger(jobId) ? boundJobServer(server.db, jobId, server.jobServer?.url ?? null) : null;
    const result = await server.tokens.issue(jobId, body.data.assertion, bound);
    if ("error" in result) return c.json({ error: result.error }, result.status);
    return c.json(result);
  });
  return app;
}
