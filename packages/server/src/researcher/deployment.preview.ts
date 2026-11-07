import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";

const PREVIEW_TTL_MS = 12 * 60 * 60_000;

// A preview session for researchers (contracts PreviewSessionSchema): the
// latest codebook, run in memory, writing nothing back (runtime/preview.ts).
export function deploymentPreview(server: Server): Hono<Env> {
  const app = new Hono<Env>();

  app.post("/study/:studyId/deployment/preview", requireStudyUser(server, "WRITE"), (c) => {
    const studyId = c.get("studyId");
    const expiresAt = Date.now() + PREVIEW_TTL_MS;
    return c.json({ deploymentId: `${studyId}.preview`, token: server.deployments.previewToken(studyId, expiresAt), expiresAt: new Date(expiresAt) });
  });

  return app;
}
