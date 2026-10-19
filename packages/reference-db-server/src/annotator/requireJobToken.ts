import type { MiddlewareHandler } from "hono";
import { INVALID_JOB_TOKEN } from "@annotinder/contracts";
import type { Env, Server } from "../context.js";
import { boundJobServer } from "../shared/deployments.js";

/**
 * Middleware for every annotator API call except the token route (`token.ts`)
 * (docs/api/annotator.md#authentication): a valid job token for this job,
 * issued to the job server the job is bound to. On 401 with
 * `code: "invalid_job_token"`, the job server gets a new token and retries once.
 */
export function requireJobToken(server: Server): MiddlewareHandler<Env> {
  return async (c, next) => {
    const jobId = Number(c.req.param("jobId"));
    const bound = Number.isInteger(jobId) ? boundJobServer(server.db, jobId, server.jobServer?.url ?? null) : null;
    if (!server.tokens.checkBearer(c.req.header("authorization"), jobId, bound)) {
      return c.json({ error: "Invalid or expired job token", code: INVALID_JOB_TOKEN }, 401);
    }
    c.set("jobId", jobId);
    await next();
  };
}
