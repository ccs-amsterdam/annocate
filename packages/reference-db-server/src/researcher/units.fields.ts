import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireJobUser } from "./auth.js";
import { getUnitFields } from "../shared/units.js";

// Static path: mounted before units.$id.ts so `/job/:jobId/units/fields` is not read as a unit id.
export function unitsFields(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/job/:jobId/units/fields", requireJobUser(db, "READ"), (c) => c.json(getUnitFields(db, c.get("jobId"))));

  return app;
}
