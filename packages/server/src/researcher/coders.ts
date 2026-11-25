import { Hono } from "hono";
import { CoderPatchSchema, CodersCreateSchema, CodersQuerySchema, DeleteCodersSchema } from "@annotinder/contracts";
import { listPage } from "../shared/paging.js";
import type { Server, Env } from "../context.js";
import { requireSensitive, requireStudyUser } from "./auth.js";
import { coderUnits, listCoderProgress } from "../shared/progress.js";
import { deleteCoders, listCoderDeletions, postponeDeletion } from "../shared/coderDeletion.js";
import { removeResultsExports } from "../shared/resultsExport.js";
import { createCoders, listCoders, setCoderEmail, unassignedUnits } from "../shared/studyCoders.js";
import { idParam, parseJson, parseQuery } from "../shared/request.js";

/** The study's coders (expert and crowd), their sessions' progress, and deleting them. */
export function coders(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/coders", requireStudyUser(server, "READ"), async (c) => {
    const studyId = c.get("studyId");
    const { kind } = parseQuery(c, CodersQuerySchema);
    const page = listPage(c, "coders", await listCoders(db, studyId, { kind }));
    return c.json({ ...page, unassigned: await unassignedUnits(db, studyId) });
  });

  app.post("/study/:studyId/coders", requireStudyUser(server, "WRITE"), async (c) => {
    const body = await parseJson(c, CodersCreateSchema);
    const studyId = c.get("studyId");
    const ids = await db.transaction((tx) => createCoders(tx, studyId, body));
    return c.json({ coders: await listCoders(db, studyId, { ids }) }, 201);
  });

  app.patch("/study/:studyId/coders/:coder", requireStudyUser(server, "WRITE"), async (c) => {
    const { email } = await parseJson(c, CoderPatchSchema);
    const studyId = c.get("studyId");
    const id = await db.transaction((tx) => setCoderEmail(tx, studyId, c.req.param("coder")!, email));
    const [updated] = await listCoders(db, studyId, { ids: [id] });
    return c.json(updated);
  });

  app.get("/study/:studyId/coders/units", requireStudyUser(server, "READ"), async (c) =>
    c.json({ coders: await coderUnits(db, c.get("studyId")) }),
  );

  app.post("/study/:studyId/coders/delete", requireStudyUser(server, "ADMIN"), requireSensitive(server), async (c) => {
    const body = await parseJson(c, DeleteCodersSchema);
    const studyId = c.get("studyId");
    const result = await deleteCoders(db, studyId, body, c.get("researcher").email);
    // A results export made before holds their answers: its download link stops working
    await removeResultsExports(server.files, studyId);
    // A deleted coder's units left the deployed coder set: the runtimes read it again
    if (result.coders.length > 0) await server.deployments.bumpRevision(studyId);
    return c.json(result);
  });

  app.get("/study/:studyId/coders/deletions", requireStudyUser(server, "READ"), async (c) =>
    c.json(await listCoderDeletions(db, c.get("studyId"))),
  );

  app.get("/study/:studyId/sessions", requireStudyUser(server, "READ"), async (c) =>
    c.json(listPage(c, "sessions", await listCoderProgress(db, c.get("studyId")))),
  );

  app.post("/study/:studyId/sessions/:id/deletion-request/postpone", requireStudyUser(server, "ADMIN"), async (c) => {
    if (!(await postponeDeletion(db, c.get("studyId"), idParam(c, "id"))))
      return c.json({ error: "No deletion request for this coder" }, 404);
    return c.body(null, 204);
  });

  return app;
}
