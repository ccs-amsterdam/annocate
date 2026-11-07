import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireStudyUser } from "./auth.js";
import { studyOverview } from "../shared/progress.js";

/** The study overview: coders, units and progress at a glance. */
export function overview(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/study/:studyId/overview", requireStudyUser(server, "READ"), async (c) => c.json(await studyOverview(db, c.get("studyId"))));

  return app;
}
