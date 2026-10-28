import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { listCoderProgress } from "../shared/progress.js";
import { declineDeletion, deleteCoders } from "../shared/coderDeletion.js";
import { DeleteCodersSchema } from "@annotinder/contracts";

/** Coder progress: who has joined and how far along they are. */
export function coders(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/coders", requireJobUser(server, "WRITE"), async (c) => c.json(await listCoderProgress(db, c.get("jobId"))));

  app.post("/job/:jobId/coders/delete", requireJobUser(server, "ADMIN"), async (c) => {
    const parsed = DeleteCodersSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const jobId = c.get("jobId");
    const result = await deleteCoders(db, jobId, parsed.data);
    // The runtime holds coders, their codings and routing in memory: it loads again.
    if (result.coderIds.length > 0) server.deployments.drop(jobId);
    return c.json(result);
  });

  app.post("/job/:jobId/coders/:id/deletion-request/decline", requireJobUser(server, "ADMIN"), async (c) => {
    if (!(await declineDeletion(db, c.get("jobId"), Number(c.req.param("id"))))) return c.json({ error: "No deletion request for this coder" }, 404);
    return c.body(null, 204);
  });

  return app;
}
