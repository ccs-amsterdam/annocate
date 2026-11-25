import { Hono } from "hono";
import { ConfirmDeletionSchema, StudyWriteSchema } from "@annotinder/contracts";
import { and, eq } from "drizzle-orm";
import { studies } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { requireSensitive, requireStudyUser } from "./auth.js";
import { changeCoderKind, forgetDeletedStudy, toStudyResponse } from "../shared/studies.js";
import { HttpError } from "../shared/http.js";
import { parseJson } from "../shared/request.js";
import { securityLog } from "../shared/securityLog.js";

export function study(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId", requireStudyUser(server, "READ"), async (c) => {
    const [row] = await db
      .select()
      .from(studies)
      .where(eq(studies.id, c.get("studyId")));
    return c.json(toStudyResponse(row!));
  });

  app.put("/study/:studyId", requireStudyUser(server, "ADMIN"), async (c) => {
    const body = await parseJson(c, StudyWriteSchema);

    const { name, archived, coderKind, reopenMinutes, redirectUrls } = body;
    const studyId = c.get("studyId");
    const row = await db.transaction(async (tx) => {
      const [before] = await tx.select({ coderKind: studies.coderKind }).from(studies).where(eq(studies.id, studyId));
      // Who codes: only another kind is a change, and only until the first deploy
      if (coderKind !== undefined && coderKind !== before!.coderKind) await changeCoderKind(tx, studyId, coderKind);
      const [saved] = await tx
        .update(studies)
        // Left out: kept
        .set({
          name,
          ...(archived !== undefined ? { archived } : {}),
          ...(reopenMinutes !== undefined ? { reopenMinutes } : {}),
          ...(redirectUrls ? { redirectUrls } : {}),
        })
        .where(eq(studies.id, studyId))
        .returning();
      return saved;
    });
    // The runtime reads whether sessions stay open and the redirect URLs with the deployment.
    await server.deployments.bumpRevision(c.get("studyId"));
    return c.json(toStudyResponse(row!));
  });

  // Deleting the study cascades to all of its rows (src/db/schema). It can't be undone, so it
  // is sensitive and the request carries the study's name, typed by whoever deletes it.
  app.delete("/study/:studyId", requireStudyUser(server, "ADMIN"), requireSensitive(server), async (c) => {
    const studyId = c.get("studyId");
    const { confirm } = await parseJson(c, ConfirmDeletionSchema);
    const named = and(eq(studies.id, studyId), eq(studies.name, confirm.trim()));
    const [deleted] = await db.delete(studies).where(named).returning({ name: studies.name });
    if (!deleted) throw new HttpError(400, "Type the study's name to confirm", "confirmation_mismatch");
    await forgetDeletedStudy(server, studyId);
    await securityLog(db, c.get("researcher").userId, "study_deleted", { studyId, name: deleted.name });
    return c.body(null, 204);
  });

  return app;
}
