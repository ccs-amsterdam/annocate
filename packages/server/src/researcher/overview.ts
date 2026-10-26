import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { jobOverview } from "../shared/progress.js";

/** The job overview: coders, units and progress at a glance. */
export function overview(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/overview", requireJobUser(server, "READ"), async (c) => c.json(await jobOverview(db, c.get("jobId"))));

  return app;
}
