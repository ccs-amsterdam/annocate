import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";

const PREVIEW_TTL_MS = 12 * 60 * 60_000;

// A preview session for researchers (contracts PreviewSessionSchema): the
// latest codebook, run in memory, writing nothing back (runtime/preview.ts).
export function deploymentPreview(server: Server): Hono<Env> {
  const app = new Hono<Env>();

  app.post("/job/:jobId/deployment/preview", requireJobUser(server, "WRITE"), (c) => {
    const jobId = c.get("jobId");
    const expiresAt = Date.now() + PREVIEW_TTL_MS;
    return c.json({ deploymentId: `${jobId}.preview`, token: server.deployments.previewToken(jobId, expiresAt), expiresAt: new Date(expiresAt) });
  });

  return app;
}
