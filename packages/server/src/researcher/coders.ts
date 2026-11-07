import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { listCoderProgress } from "../shared/progress.js";
import { deleteCoders, listCoderDeletions, postponeDeletion } from "../shared/coderDeletion.js";
import { DeleteCodersSchema } from "@annotinder/contracts";

/** Coder progress: who has joined and how far along they are. */
export function coders(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/coders", requireStudyUser(server, "READ"), async (c) => c.json(await listCoderProgress(db, c.get("studyId"))));

  app.post("/study/:studyId/coders/delete", requireStudyUser(server, "ADMIN"), async (c) => {
    const parsed = DeleteCodersSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const studyId = c.get("studyId");
    const result = await deleteCoders(db, studyId, parsed.data, c.get("researcher").email);
    return c.json(result);
  });

  app.get("/study/:studyId/coders/deletions", requireStudyUser(server, "READ"), async (c) => c.json(await listCoderDeletions(db, c.get("studyId"))));

  app.post("/study/:studyId/coders/:id/deletion-request/postpone", requireStudyUser(server, "ADMIN"), async (c) => {
    if (!(await postponeDeletion(db, c.get("studyId"), Number(c.req.param("id"))))) return c.json({ error: "No deletion request for this coder" }, 404);
    return c.body(null, 204);
  });

  return app;
}
