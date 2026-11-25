import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { adminLogRoutes } from "./admin.log.js";
import { adminPlans } from "./admin.plans.js";
import { adminRequests } from "./admin.requests.js";
import { adminSettings } from "./admin.settings.js";
import { adminStudies } from "./admin.studies.js";
import { adminUsers } from "./admin.users.js";

// The server admin's API (contracts admin.ts, docs/accounts.md): account
// role `admin`. Admins manage accounts and studies, never study data: nothing
// here returns design versions, units or answers. Every change is logged.
// One file per section (admin.*.ts); what they read is in shared/adminQueries.ts.

export function admin(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.use("/admin/*", requireResearcher(server, { role: "admin" }));
  for (const section of [adminSettings, adminPlans, adminUsers, adminRequests, adminStudies, adminLogRoutes])
    app.route("/", section(server));
  return app;
}
