import { Hono } from "hono";
import { desc } from "drizzle-orm";
import type { Server, Env } from "../context.js";
import { adminLog } from "../db/schema/index.js";

/** What admins did, the latest first. */
export function adminLogRoutes(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/admin/log", async (c) =>
    c.json(
      await db
        .select({
          at: adminLog.at,
          admin: adminLog.admin,
          action: adminLog.action,
          target: adminLog.target,
          details: adminLog.details,
        })
        .from(adminLog)
        .orderBy(desc(adminLog.id))
        .limit(500),
    ),
  );

  return app;
}
