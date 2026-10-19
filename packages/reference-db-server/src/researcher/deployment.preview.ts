import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { boundJobServer } from "../shared/deployments.js";
import { deploymentId } from "../shared/jobServer.js";

const PREVIEW_TTL_MS = 12 * 60 * 60_000;

// A preview session for researchers (contracts PreviewSessionSchema): the
// job server runs the latest codebook in memory, writing nothing back.
export function deploymentPreview(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.post("/job/:jobId/deployment/preview", requireJobUser(db, "WRITE"), (c) => {
    if (!server.jobServer) return c.json({ error: "No job server configured" }, 503);
    const jobId = c.get("jobId");
    const expiresAt = Date.now() + PREVIEW_TTL_MS;
    const token = server.tokens.previewToken(boundJobServer(db, jobId, server.jobServer.url)!, jobId, expiresAt);
    return c.json({ deploymentId: `${deploymentId(server, jobId)}.preview`, token, expiresAt: new Date(expiresAt) });
  });

  return app;
}
