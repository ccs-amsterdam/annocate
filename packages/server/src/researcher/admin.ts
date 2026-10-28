import { Hono, type Context } from "hono";
import { randomBytes } from "node:crypto";
import {
  AdminJobUpdateSchema,
  AdminUserCreateSchema,
  AdminUserUpdateSchema,
  DomainRuleWriteSchema,
  DomainSchema,
  PlanWriteSchema,
  ResearcherInviteWriteSchema,
  ResearcherRequestDecisionSchema,
  ServerSettingsSchema,
  type AccountRole,
  type AdminJob,
  type AdminUser,
  type Limits,
  type ResearcherInvite,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { HttpError } from "../shared/http.js";
import { effectiveLimits, getSettings } from "../shared/accounts.js";

// The server admin's API (contracts admin.ts, docs/accounts.md): account
// role `admin`. Admins manage accounts and jobs, never job data: nothing
// here returns codebooks, units or answers. Every change is logged.

interface UserRow {
  id: number;
  email: string;
  role: AccountRole;
  plan_id: number | null;
  limits: Limits;
  blocked_at: Date | null;
  created: Date;
  last_login: Date | null;
  jobs: number;
}

const USER_SELECT = `SELECT u.*, (SELECT count(*)::int FROM jobs j WHERE j.owner_id = u.id) AS jobs FROM users u`;

async function toAdminUser(sql: Sql, row: UserRow): Promise<AdminUser> {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    planId: row.plan_id,
    limits: row.limits,
    effectiveLimits: await effectiveLimits(sql, row.id),
    blockedAt: row.blocked_at,
    created: row.created,
    lastLogin: row.last_login,
    jobs: row.jobs,
  };
}

interface InviteRow {
  id: number;
  secret: string;
  label: string;
  plan_id: number | null;
  created_by: string;
  created: Date;
  expires: Date;
  used_by_email: string | null;
  used_at: Date | null;
  revoked_at: Date | null;
}

const INVITE_SELECT = `SELECT i.*, u.email AS used_by_email FROM researcher_invites i LEFT JOIN users u ON u.id = i.used_by`;

const toInvite = (row: InviteRow): ResearcherInvite => ({
  id: row.id,
  secret: row.secret,
  label: row.label,
  planId: row.plan_id,
  createdBy: row.created_by,
  created: row.created,
  expires: row.expires,
  usedBy: row.used_by_email,
  usedAt: row.used_at,
  revokedAt: row.revoked_at,
});

const JOB_SELECT = `SELECT j.id, j.name, j.created, j.archived, j.suspended_at, o.email AS owner,
  (SELECT count(*)::int FROM units WHERE job_id = j.id) AS units,
  (SELECT count(*)::int FROM coders WHERE job_id = j.id) AS coders,
  (SELECT count(*)::int FROM annotation_values WHERE job_id = j.id) AS answers
  FROM jobs j LEFT JOIN users o ON o.id = j.owner_id`;

const toAdminJob = (row: Omit<AdminJob, "suspendedAt"> & { suspended_at: Date | null }): AdminJob => ({
  id: row.id,
  name: row.name,
  owner: row.owner,
  created: row.created,
  archived: row.archived,
  suspendedAt: row.suspended_at,
  units: row.units,
  coders: row.coders,
  answers: row.answers,
});

async function body<T>(c: Context, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: unknown } }): Promise<T> {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) throw new HttpError(400, "Invalid request body");
  return parsed.data;
}

export function admin(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  app.use("/admin/*", requireResearcher(server, { role: "admin" }));

  const log = (c: Context<Env>, action: string, target: string, details: object = {}) =>
    db.query("INSERT INTO admin_log (admin, action, target, details) VALUES ($1, $2, $3, $4)", [
      c.get("researcher").email,
      action,
      target,
      JSON.stringify(details),
    ]);

  // ---- settings ----------------------------------------------------------------

  app.get("/admin/settings", async (c) => c.json(await getSettings(db)));

  app.put("/admin/settings", async (c) => {
    const settings = await body(c, ServerSettingsSchema);
    await getSettings(db); // the row exists
    await db.query("UPDATE server_settings SET registration = $1, default_plan_id = $2, unit_bytes = $3, answer_bytes = $4", [
      JSON.stringify(settings.registration),
      settings.defaultPlanId,
      settings.unitBytes,
      settings.answerBytes,
    ]);
    await log(c, "settings", "server", settings);
    return c.json(await getSettings(db));
  });

  // ---- plans and domains -------------------------------------------------------

  app.get("/admin/plans", async (c) => c.json(await db.query("SELECT id, name, limits FROM plans ORDER BY name")));

  app.post("/admin/plans", async (c) => {
    const plan = await body(c, PlanWriteSchema);
    const row = await one(db, "INSERT INTO plans (name, limits) VALUES ($1, $2) RETURNING id, name, limits", [plan.name, JSON.stringify(plan.limits)]);
    await log(c, "create plan", plan.name, plan.limits);
    return c.json(row, 201);
  });

  app.put("/admin/plans/:id", async (c) => {
    const plan = await body(c, PlanWriteSchema);
    const row = await one(db, "UPDATE plans SET name = $1, limits = $2 WHERE id = $3 RETURNING id, name, limits", [
      plan.name,
      JSON.stringify(plan.limits),
      Number(c.req.param("id")),
    ]);
    if (!row) throw new HttpError(404, "Plan not found");
    await log(c, "update plan", plan.name, plan.limits);
    return c.json(row);
  });

  app.delete("/admin/plans/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if ((await getSettings(db)).defaultPlanId === id) throw new HttpError(409, "This is the default plan: choose another default first");
    const row = await one<{ name: string }>(db, "DELETE FROM plans WHERE id = $1 RETURNING name", [id]);
    if (!row) throw new HttpError(404, "Plan not found");
    await log(c, "delete plan", row.name);
    return c.body(null, 204);
  });

  app.get("/admin/domains", async (c) =>
    c.json(await db.query(`SELECT domain, researcher, plan_id AS "planId" FROM domain_rules ORDER BY domain`)),
  );

  app.put("/admin/domains/:domain", async (c) => {
    const domain = DomainSchema.safeParse(c.req.param("domain"));
    if (!domain.success) throw new HttpError(400, "A domain like uni.nl or *.uni.nl");
    const rule = await body(c, DomainRuleWriteSchema);
    await db.query(
      `INSERT INTO domain_rules (domain, researcher, plan_id) VALUES ($1, $2, $3)
       ON CONFLICT (domain) DO UPDATE SET researcher = excluded.researcher, plan_id = excluded.plan_id`,
      [domain.data, rule.researcher, rule.planId],
    );
    await log(c, "domain", domain.data, rule);
    return c.json({ domain: domain.data, ...rule });
  });

  app.delete("/admin/domains/:domain", async (c) => {
    const domain = c.req.param("domain").toLowerCase();
    if ((await db.query("DELETE FROM domain_rules WHERE domain = $1 RETURNING domain", [domain])).length === 0) throw new HttpError(404, "No such domain");
    await log(c, "delete domain", domain);
    return c.body(null, 204);
  });

  // ---- users -------------------------------------------------------------------

  app.get("/admin/users", async (c) => {
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const rows = await db.query<UserRow>(
      `${USER_SELECT} WHERE ($1 = '' OR u.email LIKE '%' || $1 || '%') ORDER BY u.last_login DESC NULLS LAST, u.id DESC LIMIT 200`,
      [q],
    );
    return c.json(await Promise.all(rows.map((r) => toAdminUser(db, r))));
  });

  const userById = async (id: number) => {
    const row = await one<UserRow>(db, `${USER_SELECT} WHERE u.id = $1`, [id]);
    if (!row) throw new HttpError(404, "User not found");
    return toAdminUser(db, row);
  };

  app.post("/admin/users", async (c) => {
    const user = await body(c, AdminUserCreateSchema);
    const email = user.email.trim().toLowerCase();
    const row = await one<{ id: number }>(
      db,
      `INSERT INTO users (email, role, plan_id) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET role = excluded.role, plan_id = COALESCE(excluded.plan_id, users.plan_id) RETURNING id`,
      [email, user.role, user.planId ?? null],
    );
    await log(c, "add user", email, { role: user.role, planId: user.planId ?? null });
    return c.json(await userById(row!.id), 201);
  });

  app.put("/admin/users/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const update = await body(c, AdminUserUpdateSchema);
    const before = await userById(id);
    if (id === c.get("researcher").userId && (update.blocked || (update.role && update.role !== "admin"))) {
      throw new HttpError(409, "You can't block yourself or take away your own admin role");
    }
    await db.transaction(async (tx) => {
      if (update.role) await tx.query("UPDATE users SET role = $1 WHERE id = $2", [update.role, id]);
      if (update.planId !== undefined) await tx.query("UPDATE users SET plan_id = $1 WHERE id = $2", [update.planId, id]);
      if (update.limits) await tx.query("UPDATE users SET limits = $1 WHERE id = $2", [JSON.stringify(update.limits), id]);
      if (update.blocked === true) {
        await tx.query("UPDATE users SET blocked_at = COALESCE(blocked_at, now()) WHERE id = $1", [id]);
        // Blocked: their logins end now (API keys stop working too, shared/accounts.ts).
        await tx.query("DELETE FROM sessions WHERE user_id = $1", [id]);
      }
      if (update.blocked === false) await tx.query("UPDATE users SET blocked_at = NULL WHERE id = $1", [id]);
    });
    await log(c, update.blocked === true ? "block user" : update.blocked === false ? "unblock user" : "update user", before.email, update);
    return c.json(await userById(id));
  });

  // ---- becoming a researcher ---------------------------------------------------

  app.get("/admin/requests", async (c) =>
    c.json(
      await db.query(
        `SELECT r.user_id AS "userId", u.email, r.message, r.at FROM researcher_requests r JOIN users u ON u.id = r.user_id
         WHERE r.decided_at IS NULL ORDER BY r.at`,
      ),
    ),
  );

  app.post("/admin/requests/:userId", async (c) => {
    const userId = Number(c.req.param("userId"));
    const { approve } = await body(c, ResearcherRequestDecisionSchema);
    const row = await one<{ email: string }>(
      db,
      `UPDATE researcher_requests r SET decided_at = now(), decided_by = $2, approved = $3 FROM users u
       WHERE r.user_id = $1 AND u.id = r.user_id AND r.decided_at IS NULL RETURNING u.email`,
      [userId, c.get("researcher").email, approve],
    );
    if (!row) throw new HttpError(404, "No open request from this user");
    if (approve) await db.query("UPDATE users SET role = 'researcher' WHERE id = $1 AND role = 'user'", [userId]);
    await log(c, approve ? "approve request" : "deny request", row.email);
    return c.body(null, 204);
  });

  app.get("/admin/researcher-invites", async (c) => c.json((await db.query<InviteRow>(`${INVITE_SELECT} ORDER BY i.id DESC`)).map(toInvite)));

  app.post("/admin/researcher-invites", async (c) => {
    const invite = await body(c, ResearcherInviteWriteSchema);
    const created = await one<{ id: number }>(
      db,
      `INSERT INTO researcher_invites (secret, label, plan_id, created_by, expires) VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING id`,
      [randomBytes(18).toString("base64url"), invite.label, invite.planId ?? null, c.get("researcher").email, invite.days],
    );
    await log(c, "researcher invite", invite.label, { planId: invite.planId ?? null, days: invite.days });
    return c.json(toInvite((await one<InviteRow>(db, `${INVITE_SELECT} WHERE i.id = $1`, [created!.id]))!), 201);
  });

  app.post("/admin/researcher-invites/:id/revoke", async (c) => {
    const id = Number(c.req.param("id"));
    const row = await one<{ label: string }>(db, "UPDATE researcher_invites SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING label", [id]);
    if (!row) throw new HttpError(404, "Invite not found");
    await log(c, "revoke researcher invite", row.label);
    return c.json(toInvite((await one<InviteRow>(db, `${INVITE_SELECT} WHERE i.id = $1`, [id]))!));
  });

  // ---- jobs --------------------------------------------------------------------

  app.get("/admin/jobs", async (c) => c.json((await db.query<Parameters<typeof toAdminJob>[0]>(`${JOB_SELECT} ORDER BY j.id DESC`)).map(toAdminJob)));

  app.put("/admin/jobs/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const update = await body(c, AdminJobUpdateSchema);
    const job = await one<{ name: string }>(db, "SELECT name FROM jobs WHERE id = $1", [id]);
    if (!job) throw new HttpError(404, "Job not found");
    if (update.owner !== undefined) {
      const owner = await one<{ id: number; role: AccountRole }>(db, "SELECT id, role FROM users WHERE email = $1", [update.owner.toLowerCase()]);
      if (!owner || owner.role === "user") throw new HttpError(400, "The new owner must be a researcher on this server");
      await db.query("UPDATE jobs SET owner_id = $1 WHERE id = $2", [owner.id, id]);
    }
    if (update.suspended !== undefined) {
      await db.query(`UPDATE jobs SET suspended_at = ${update.suspended ? "COALESCE(suspended_at, now())" : "NULL"} WHERE id = $1`, [id]);
      // Coders are refused from now on (the runtime loads again, runtime/store.ts).
      server.deployments.drop(id);
    }
    await log(c, update.suspended === true ? "suspend job" : update.suspended === false ? "resume job" : "update job", `#${id} ${job.name}`, update);
    return c.json(toAdminJob((await one<Parameters<typeof toAdminJob>[0]>(db, `${JOB_SELECT} WHERE j.id = $1`, [id]))!));
  });

  app.get("/admin/log", async (c) => c.json(await db.query("SELECT at, admin, action, target, details FROM admin_log ORDER BY id DESC LIMIT 500")));

  return app;
}
