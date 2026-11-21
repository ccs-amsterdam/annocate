import { Hono } from "hono";
import { StudyWriteSchema } from "@annotinder/contracts";
import { eq } from "drizzle-orm";
import { studies } from "../db/schema/index.js";
import type { Server, Env } from "../context.js";
import { requireSensitive, requireStudyUser } from "./auth.js";
import { toStudyResponse } from "../shared/studies.js";

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
    const parsed = StudyWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { name, archived, keepSessionsOpen, redirectUrls } = parsed.data;
    const [row] = await db
      .update(studies)
      // Left out: kept (except archived: false)
      .set({
        name,
        archived: archived ?? false,
        ...(keepSessionsOpen !== undefined ? { keepSessionsOpen } : {}),
        ...(redirectUrls ? { redirectUrls } : {}),
      })
      .where(eq(studies.id, c.get("studyId")))
      .returning();
    // The runtime reads whether sessions stay open and the redirect URLs with the deployment.
    await server.deployments.refresh(c.get("studyId"));
    return c.json(toStudyResponse(row!));
  });

  // Deleting the study cascades to all of its rows (src/db/schema).
  app.delete("/study/:studyId", requireStudyUser(server, "ADMIN"), requireSensitive(server), async (c) => {
    await db.delete(studies).where(eq(studies.id, c.get("studyId")));
    server.deployments.drop(c.get("studyId"));
    return c.body(null, 204);
  });

  return app;
}
