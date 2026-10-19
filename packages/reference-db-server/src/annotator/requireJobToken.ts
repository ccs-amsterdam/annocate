import type { Context, Next } from "hono";
import { INVALID_JOB_TOKEN } from "@annotinder/contracts";
import type { JobTokenIssuer } from "../jobTokens.js";
import type { Store } from "../store.js";

/**
 * Middleware for every annotator API call except `requestJobToken`
 * (docs/api/annotator.md#authentication): a valid job token for this job,
 * issued to the job server the job is bound to. On 401 with
 * `code: "invalid_job_token"`, the job server gets a new token and retries once.
 */
export const requireJobToken = (store: Store, tokens: JobTokenIssuer) => async (c: Context, next: Next) => {
  const jobId = Number(c.req.param("jobId"));
  const boundJobServer = jobId === store.spec.jobId ? store.jobServerUrl : null;
  if (!tokens.checkBearer(c.req.header("authorization"), jobId, boundJobServer)) {
    return c.json({ error: "Invalid or expired job token", code: INVALID_JOB_TOKEN }, 401);
  }
  await next();
};
