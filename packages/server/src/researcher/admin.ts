import { Hono, type Context } from "hono";
import {
  AdminStudyUpdateSchema,
  AdminUserCreateSchema,
  AdminUserUpdateSchema,
  DomainRuleWriteSchema,
  DomainSchema,
  PlanWriteSchema,
  ResearcherRequestDecisionSchema,
  ServerSettingsSchema,
  type AccountRole,
  type AdminStudy,
  type AdminUser,
  type Limits,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import type { Server, Env } from "../context.js";
import { checkSensitive, requireResearcher } from "./auth.js";
import { serverWarnings } from "../shared/warnings.js";
import { HttpError } from "../shared/http.js";
import { effectiveLimits, getSettings, setServerRole, userForEmail } from "../shared/accounts.js";

// The server admin's API (contracts admin.ts, docs/accounts.md): account
// role `admin`. Admins manage accounts and studies, never study data: nothing
// here returns design versions, units or answers. Every change is logged.

interface UserRow {
  id: number;
  email: string;
  role: AccountRole;
  role_via: "user" | "domain" | "everyone" | null;
  plan_id: number | null;
  limits: Limits;
  blocked_at: Date | null;
  created: Date;
  last_login_at: Date | null;
  registered: boolean;
  invitation_expired: boolean;
  roles_disabled: number;
  has_mfa: boolean;
  linked: boolean;
  studies: number;
}

/**
 * Users with their account role and where it comes from, whether they
 * claimed their account (`registered`), whether their invitation expired
 * (unclaimed 3 months after their first role), roles the safeguards turned
 * off, and (`$1`: the current provider's issuer) whether they linked a login there.
 */
const USER_SELECT = `SELECT u.*, account_role(u.id) AS role, u.registered_at IS NOT NULL AS registered,
  (SELECT CASE WHEN bool_or(r.user_id IS NOT NULL) THEN 'user' WHEN bool_or(r.email_domain IS NOT NULL) THEN 'domain' WHEN count(*) > 0 THEN 'everyone' END
     FROM roles r WHERE r.study_id IS NULL AND role_applies(r, u) AND r.role = account_role(u.id)) AS role_via,
  (u.registered_at IS NULL AND EXISTS (SELECT 1 FROM roles r WHERE r.user_id = u.id AND r.granted_at < now() - interval '3 months')) AS invitation_expired,
  (SELECT count(*)::int FROM roles r WHERE r.user_id = u.id AND u.registered_at IS NOT NULL AND NOT role_applies(r, u)) AS roles_disabled,
  EXISTS (SELECT 1 FROM identities i WHERE i.user_id = u.id AND rtrim(i.iss, '/') = rtrim($1::text, '/')) AS linked,
  (SELECT count(*)::int FROM studies j WHERE j.owner_id = u.id) AS studies
  FROM users u`;

async function toAdminUser(sql: Sql, row: UserRow): Promise<AdminUser> {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    roleVia: row.role_via,
    registered: row.registered,
    invitationExpired: row.invitation_expired,
    rolesDisabled: row.roles_disabled,
    hasMfa: row.has_mfa,
    linked: row.linked,
    planId: row.plan_id,
    limits: row.limits,
    effectiveLimits: await effectiveLimits(sql, row.id),
    blockedAt: row.blocked_at,
    created: row.created,
    lastLogin: row.last_login_at,
    studies: row.studies,
  };
}

const STUDY_SELECT = `SELECT j.id, j.name, j.created, j.archived, j.suspended_at, o.email AS owner,
  (SELECT count(*)::int FROM units WHERE study_id = j.id AND in_draft) AS units,
  (SELECT count(*)::int FROM coders WHERE study_id = j.id) AS coders,
  (SELECT count(*)::int FROM annotation_values WHERE study_id = j.id) AS answers
  FROM studies j LEFT JOIN users o ON o.id = j.owner_id`;

const toAdminStudy = (row: Omit<AdminStudy, "suspendedAt"> & { suspended_at: Date | null }): AdminStudy => ({
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

async function body<T>(
  c: Context,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: unknown } },
): Promise<T> {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) throw new HttpError(400, "Invalid request body");
  return parsed.data;
}

export function admin(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  app.use("/admin/*", requireResearcher(server, { role: "admin" }));

  /** The current login provider's issuer (whether users linked a login there). */
  const issuer = () => server.login?.oidc.issuer ?? "";

  const log = (c: Context<Env>, action: string, target: string, details: object = {}) =>
    db.query("INSERT INTO admin_log (admin, action, target, details) VALUES ($1, $2, $3, $4)", [
      c.get("researcher").email,
      action,
      target,
      JSON.stringify(details),
    ]);

  // ---- warnings and settings ---------------------------------------------------

  app.get("/admin/warnings", async (c) => c.json(await serverWarnings(server)));

  app.get("/admin/settings", async (c) => c.json(await getSettings(db)));

  app.put("/admin/settings", async (c) => {
    const settings = await body(c, ServerSettingsSchema);
    await getSettings(db); // the row exists
    // Open registration is a role: researcher, for every user with an email address
    await db.query(
      "DELETE FROM roles WHERE study_id IS NULL AND user_id IS NULL AND email_domain IS NULL AND role = 'researcher'",
    );
    if (settings.registration.open)
      await db.query("INSERT INTO roles (role, granted_by) VALUES ('researcher', $1)", [c.get("researcher").email]);
    await db.query(
      "UPDATE server_settings SET registration = $1, default_plan_id = $2, unit_bytes = $3, answer_bytes = $4",
      [
        JSON.stringify({ requests: settings.registration.requests }),
        settings.defaultPlanId,
        settings.unitBytes,
        settings.answerBytes,
      ],
    );
    await log(c, "settings", "server", settings);
    return c.json(await getSettings(db));
  });

  // ---- plans and domains -------------------------------------------------------

  app.get("/admin/plans", async (c) => c.json(await db.query("SELECT id, name, limits FROM plans ORDER BY name")));

  app.post("/admin/plans", async (c) => {
    const plan = await body(c, PlanWriteSchema);
    const row = await one(db, "INSERT INTO plans (name, limits) VALUES ($1, $2) RETURNING id, name, limits", [
      plan.name,
      JSON.stringify(plan.limits),
    ]);
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
    if ((await getSettings(db)).defaultPlanId === id)
      throw new HttpError(409, "This is the default plan: choose another default first");
    const row = await one<{ name: string }>(db, "DELETE FROM plans WHERE id = $1 RETURNING name", [id]);
    if (!row) throw new HttpError(404, "Plan not found");
    await log(c, "delete plan", row.name);
    return c.body(null, 204);
  });

  // A domain rule: a researcher role for users with an email address there, and/or their plan
  app.get("/admin/domains", async (c) =>
    c.json(
      await db.query(
        `SELECT d.domain, EXISTS (SELECT 1 FROM roles r WHERE r.study_id IS NULL AND r.user_id IS NULL AND r.email_domain = d.domain) AS researcher,
           (SELECT plan_id FROM domain_plans p WHERE p.domain = d.domain) AS "planId"
         FROM (SELECT email_domain AS domain FROM roles WHERE study_id IS NULL AND user_id IS NULL AND email_domain IS NOT NULL
               UNION SELECT domain FROM domain_plans) d ORDER BY d.domain`,
      ),
    ),
  );

  app.put("/admin/domains/:domain", async (c) => {
    const domain = DomainSchema.safeParse(c.req.param("domain"));
    if (!domain.success) throw new HttpError(400, "A domain like uni.nl or *.uni.nl");
    const rule = await body(c, DomainRuleWriteSchema);
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM roles WHERE study_id IS NULL AND user_id IS NULL AND email_domain = $1", [
        domain.data,
      ]);
      if (rule.researcher)
        await tx.query("INSERT INTO roles (role, email_domain, granted_by) VALUES ('researcher', $1, $2)", [
          domain.data,
          c.get("researcher").email,
        ]);
      await tx.query("DELETE FROM domain_plans WHERE domain = $1", [domain.data]);
      if (rule.planId !== null)
        await tx.query("INSERT INTO domain_plans (domain, plan_id) VALUES ($1, $2)", [domain.data, rule.planId]);
    });
    await log(c, "domain", domain.data, rule);
    return c.json({ domain: domain.data, ...rule });
  });

  app.delete("/admin/domains/:domain", async (c) => {
    const domain = c.req.param("domain").toLowerCase();
    const roles = await db.query(
      "DELETE FROM roles WHERE study_id IS NULL AND user_id IS NULL AND email_domain = $1 RETURNING id",
      [domain],
    );
    const plans = await db.query("DELETE FROM domain_plans WHERE domain = $1 RETURNING domain", [domain]);
    if (roles.length + plans.length === 0) throw new HttpError(404, "No such domain");
    await log(c, "delete domain", domain);
    return c.body(null, 204);
  });

  // ---- users -------------------------------------------------------------------

  app.get("/admin/users", async (c) => {
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const rows = await db.query<UserRow>(
      `${USER_SELECT} WHERE ($2 = '' OR u.email LIKE '%' || $2 || '%') ORDER BY u.last_login_at DESC NULLS LAST, u.id DESC LIMIT 200`,
      [issuer(), q],
    );
    return c.json(await Promise.all(rows.map((r) => toAdminUser(db, r))));
  });

  const userById = async (id: number) => {
    const row = await one<UserRow>(db, `${USER_SELECT} WHERE u.id = $2`, [issuer(), id]);
    if (!row) throw new HttpError(404, "User not found");
    return toAdminUser(db, row);
  };

  app.post("/admin/users", async (c) => {
    const user = await body(c, AdminUserCreateSchema);
    if (user.role === "admin") checkSensitive(server, c.get("researcher"));
    const email = user.email.trim().toLowerCase();
    // A user with this email, else an invitation: a shadow user, claimed at their first login
    const id = await db.transaction(async (tx) => {
      const { id } = await userForEmail(tx, email);
      await setServerRole(tx, id, user.role, c.get("researcher").email);
      if (user.planId != null) await tx.query("UPDATE users SET plan_id = $1 WHERE id = $2", [user.planId, id]);
      return id;
    });
    await log(c, "add user", email, { role: user.role, planId: user.planId ?? null });
    return c.json(await userById(id), 201);
  });

  // Withdraws an invitation (a shadow user, with its roles)
  app.delete("/admin/users/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const user = await userById(id);
    if (user.registered) throw new HttpError(409, "This user has logged in: block them instead");
    await db.query("DELETE FROM users WHERE id = $1 AND registered_at IS NULL", [id]);
    await log(c, "withdraw invitation", user.email);
    return c.body(null, 204);
  });

  app.put("/admin/users/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const update = await body(c, AdminUserUpdateSchema);
    const before = await userById(id);
    if (id === c.get("researcher").userId && (update.blocked || (update.role && update.role !== "admin"))) {
      throw new HttpError(409, "You can't block yourself or take away your own admin role");
    }
    // Giving or taking the admin role is sensitive (researcher/auth.ts)
    if (update.role && update.role !== before.role && (update.role === "admin" || before.role === "admin"))
      checkSensitive(server, c.get("researcher"));
    await db.transaction(async (tx) => {
      if (update.role) await setServerRole(tx, id, update.role, c.get("researcher").email);
      // The safeguards turned their roles off: restored (their dates count from now)
      if (update.restoreRoles) await tx.query("UPDATE roles SET granted_at = now() WHERE user_id = $1", [id]);
      if (update.planId !== undefined)
        await tx.query("UPDATE users SET plan_id = $1 WHERE id = $2", [update.planId, id]);
      if (update.limits)
        await tx.query("UPDATE users SET limits = $1 WHERE id = $2", [JSON.stringify(update.limits), id]);
      if (update.blocked === true) {
        await tx.query("UPDATE users SET blocked_at = COALESCE(blocked_at, now()) WHERE id = $1", [id]);
        // Blocked: their logins end now (API keys stop working too, shared/accounts.ts).
        await tx.query("DELETE FROM sessions WHERE user_id = $1", [id]);
      }
      if (update.blocked === false) await tx.query("UPDATE users SET blocked_at = NULL WHERE id = $1", [id]);
    });
    await log(
      c,
      update.blocked === true
        ? "block user"
        : update.blocked === false
          ? "unblock user"
          : update.restoreRoles
            ? "restore roles"
            : "update user",
      before.email,
      update,
    );
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
    if (
      approve &&
      (await one<{ role: AccountRole }>(db, "SELECT account_role($1) AS role", [userId]))?.role === "user"
    ) {
      await setServerRole(db, userId, "researcher", c.get("researcher").email);
    }
    await log(c, approve ? "approve request" : "deny request", row.email);
    return c.body(null, 204);
  });

  // ---- studies --------------------------------------------------------------------

  app.get("/admin/studies", async (c) =>
    c.json(
      (await db.query<Parameters<typeof toAdminStudy>[0]>(`${STUDY_SELECT} ORDER BY j.id DESC`)).map(toAdminStudy),
    ),
  );

  app.put("/admin/studies/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const update = await body(c, AdminStudyUpdateSchema);
    const study = await one<{ name: string }>(db, "SELECT name FROM studies WHERE id = $1", [id]);
    if (!study) throw new HttpError(404, "Study not found");
    if (update.owner !== undefined) {
      const owner = await one<{ id: number; role: AccountRole }>(
        db,
        "SELECT id, account_role(id) AS role FROM users WHERE email = $1 AND registered_at IS NOT NULL ORDER BY last_login_at DESC NULLS LAST LIMIT 1",
        [update.owner.toLowerCase()],
      );
      if (!owner || owner.role === "user")
        throw new HttpError(400, "The new owner must be a researcher on this server");
      await db.query("UPDATE studies SET owner_id = $1 WHERE id = $2", [owner.id, id]);
    }
    if (update.suspended !== undefined) {
      await db.query(
        `UPDATE studies SET suspended_at = ${update.suspended ? "COALESCE(suspended_at, now())" : "NULL"} WHERE id = $1`,
        [id],
      );
      // Coders are refused from now on (the runtime loads again, runtime/store.ts).
      server.deployments.drop(id);
    }
    await log(
      c,
      update.suspended === true ? "suspend study" : update.suspended === false ? "resume study" : "update study",
      `#${id} ${study.name}`,
      update,
    );
    return c.json(
      toAdminStudy((await one<Parameters<typeof toAdminStudy>[0]>(db, `${STUDY_SELECT} WHERE j.id = $1`, [id]))!),
    );
  });

  app.get("/admin/log", async (c) =>
    c.json(await db.query("SELECT at, admin, action, target, details FROM admin_log ORDER BY id DESC LIMIT 500")),
  );

  return app;
}
