import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireResearcher, requireSensitive, requireStudyUser } from "./auth.js";
import { checkStudyLimit } from "./study.js";
import { toStudyResponse } from "../shared/studies.js";
import { exportStudy, importStudy } from "../shared/studyExport.js";
import { securityLog } from "../shared/securityLog.js";

// Study exports (shared/studyExport.ts): the whole study, coders and answers
// included, to restore it or move it to another server. Exporting is the
// study ADMIN's, and sensitive (it holds coders' data); importing makes a new
// study, owned by the importer.
export function studyExports(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.post("/study/import", requireResearcher(server, { role: "researcher" }), async (c) => {
    const researcher = c.get("researcher");
    await checkStudyLimit(db, researcher.userId);
    const bytes = Buffer.from(await c.req.arrayBuffer());
    const study = await db.transaction((tx) =>
      importStudy(tx, bytes, {
        ownerId: researcher.userId,
        // Development headers keep the bootstrap rule (a study without user roles is open)
        ownerIsAdmin: !researcher.devRole,
        name: c.req.query("name"),
        coders: c.req.query("coders") !== "false",
      }),
    );
    return c.json(toStudyResponse(study), 201);
  });

  app.get("/study/:studyId/export", requireStudyUser(server, "ADMIN"), requireSensitive(server), async (c) => {
    const studyId = c.get("studyId");
    const { name, bytes } = await exportStudy(db, studyId);
    await securityLog(db, c.get("researcher").userId, "study_exported", { studyId });
    const file = `${name.replace(/[^\w-]+/g, "_") || "study"}_${new Date().toISOString().slice(0, 10)}.annotinder.gz`;
    return c.body(new Uint8Array(bytes), 200, {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${file}"`,
    });
  });

  return app;
}
