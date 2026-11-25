import { Hono } from "hono";
import { listPage } from "../shared/paging.js";
import type { Server, Env } from "../context.js";
import { requireSensitive, requireStudyUser } from "./auth.js";
import { coderUnits, listCoderProgress } from "../shared/progress.js";
import { deleteCoders, listCoderDeletions, postponeDeletion } from "../shared/coderDeletion.js";
import { removeResultsExports } from "../shared/resultsExport.js";
import { DeleteCodersSchema } from "@annotinder/contracts";
import { idParam, parseJson } from "../shared/request.js";

/** Coder progress: who has joined and how far along they are. */
export function coders(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/coders", requireStudyUser(server, "READ"), async (c) =>
    c.json(listPage(c, "coders", await listCoderProgress(db, c.get("studyId")))),
  );

  app.get("/study/:studyId/coders/units", requireStudyUser(server, "READ"), async (c) =>
    c.json({ coders: await coderUnits(db, c.get("studyId")) }),
  );

  app.post("/study/:studyId/coders/delete", requireStudyUser(server, "ADMIN"), requireSensitive(server), async (c) => {
    const body = await parseJson(c, DeleteCodersSchema);
    const studyId = c.get("studyId");
    const result = await deleteCoders(db, studyId, body, c.get("researcher").email);
    // A results export made before holds their answers: its download link stops working
    await removeResultsExports(server.files, studyId);
    return c.json(result);
  });

  app.get("/study/:studyId/coders/deletions", requireStudyUser(server, "READ"), async (c) =>
    c.json(await listCoderDeletions(db, c.get("studyId"))),
  );

  app.post("/study/:studyId/coders/:id/deletion-request/postpone", requireStudyUser(server, "ADMIN"), async (c) => {
    if (!(await postponeDeletion(db, c.get("studyId"), idParam(c, "id"))))
      return c.json({ error: "No deletion request for this coder" }, 404);
    return c.body(null, 204);
  });

  return app;
}
