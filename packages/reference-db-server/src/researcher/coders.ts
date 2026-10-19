import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { listCoderProgress } from "../shared/progress.js";

/** Coder progress: who has joined and how far along they are. */
export function coders(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/coders", requireJobUser(db, "WRITE"), (c) => c.json(listCoderProgress(db, c.get("jobId"))));

  return app;
}
