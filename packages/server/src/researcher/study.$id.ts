import { Hono } from "hono";
import { StudyWriteSchema } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { toStudyResponse, type StudyRow } from "../shared/studies.js";

export function study(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId", requireStudyUser(server, "READ"), async (c) => {
    const row = await one<StudyRow>(db, "SELECT * FROM studies WHERE id = $1", [c.get("studyId")]);
    return c.json(toStudyResponse(row!));
  });

  app.put("/study/:studyId", requireStudyUser(server, "ADMIN"), async (c) => {
    const parsed = StudyWriteSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const row = await one<StudyRow>(
      db,
      `UPDATE studies SET name = $1, archived = $2, keep_sessions_open = COALESCE($3, keep_sessions_open),
         redirect_urls = COALESCE($5::jsonb, redirect_urls) WHERE id = $4 RETURNING *`,
      [
        parsed.data.name,
        parsed.data.archived ?? false,
        parsed.data.keepSessionsOpen ?? null,
        c.get("studyId"),
        parsed.data.redirectUrls ? JSON.stringify(parsed.data.redirectUrls) : null,
      ],
    );
    // The runtime reads whether sessions stay open, and the redirect URLs, with the deployment.
    await server.deployments.refresh(c.get("studyId"));
    return c.json(toStudyResponse(row!));
  });

  // Deleting the study cascades to all of its rows (migrations/).
  app.delete("/study/:studyId", requireStudyUser(server, "ADMIN"), async (c) => {
    await db.query("DELETE FROM studies WHERE id = $1", [c.get("studyId")]);
    server.deployments.drop(c.get("studyId"));
    return c.body(null, 204);
  });

  return app;
}
