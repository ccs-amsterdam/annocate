import { Hono } from "hono";
import type { Env, Server } from "../context.js";
import { getDeploymentSpec, getPreviewSpec } from "../shared/deployments.js";

/**
 * `GET /annotator/job/:jobId/deployment` (docs/api/annotator.md#getdeployment).
 * Everything the job server needs to run the job, minus unit content: the
 * deployed codebook, the unitsets (plus `__all__`), version and active flag.
 * A real db server builds this from its deployment record and answers 404 if
 * the job isn't deployed (and supports `?preview=1`: the latest codebook).
 */
export function getDeployment(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/", (c) => {
    const preview = c.req.query("preview") === "1";
    const jobId = c.get("jobId");
    const spec = preview ? getPreviewSpec(server.db, jobId) : getDeploymentSpec(server.db, jobId);
    if (!spec) return c.json({ error: preview ? "Job has no codebook" : "Job is not deployed" }, 404);
    return c.json(spec);
  });
  return app;
}
