import type { Context } from "hono";
import { JobTokenRequestSchema } from "@annotinder/contracts";
import type { JobTokenIssuer } from "../jobTokens.js";
import type { Store } from "../store.js";
import { parseBody } from "./parse.js";

/**
 * `POST /annotator/job/:jobId/token` (docs/api/annotator.md#requestjobtoken).
 * A job server asks for a job token with a request it signed with its own
 * key; the checks are in jobTokens.ts. The only call without a job token:
 * this is how a job server gets one.
 */
export const requestJobToken = (store: Store, tokens: JobTokenIssuer) => async (c: Context) => {
  const body = await parseBody(c, JobTokenRequestSchema);
  if (!body) return c.json({ error: "Invalid body" }, 400);
  const jobId = Number(c.req.param("jobId"));
  // Only the job server the job is bound to gets a token
  const boundJobServer = jobId === store.spec.jobId ? store.jobServerUrl : null;
  const result = await tokens.issue(jobId, body.assertion, boundJobServer);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json(result);
};
