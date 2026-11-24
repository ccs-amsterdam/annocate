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
  type AdminUser,
} from "@annotinder/contracts";
import { and, asc, desc, eq, exists, isNotNull, isNull, like, not, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  adminLog,
  annotationValues,
  coderSessions,
  domainPlans,
  identities,
  plans,
  researcherRequests,
  roles,
  serverSettings,
  sessions,
  studies,
  units,
  users,
} from "../db/schema/index.js";
import { accountRole, roleApplies } from "../db/sql.js";
import type { Server, Env } from "../context.js";
import { checkSensitive, requireResearcher } from "./auth.js";
import { serverWarnings } from "../shared/warnings.js";
import { HttpError } from "../shared/http.js";
import { effectiveLimits, everyoneResearcher, getSettings, setServerRole, userForEmail } from "../shared/accounts.js";
import { idParam, parseJson } from "../shared/request.js";

// The server admin's API (contracts admin.ts, docs/accounts.md): account
// role `admin`. Admins manage accounts and studies, never study data: nothing
// here returns design versions, units or answers. Every change is logged.

/** Server roles (not a study's). */
const serverRole = isNull(roles.studyId);

/**
 * Users with their account role and where it comes from, whether they
 * claimed their account (`registered`), whether their invitation expired
 * (unclaimed 3 months after their first role), roles the safeguards turned
 * off, and whether they linked a login at the current provider (`issuer`).
 */
function selectUsers(db: Db, issuer: string) {
  const role = accountRole(users.id);
  const registered = sql<boolean>`${users.registeredAt} IS NOT NULL`;
  // Where their account role comes from: their own role, their domain's, or everyone's
  const roleVia = db
    .select({
      via: sql`CASE WHEN bool_or(${roles.userId} IS NOT NULL) THEN 'user' WHEN bool_or(${roles.emailDomain} IS NOT NULL) THEN 'domain' WHEN count(*) > 0 THEN 'everyone' END`,
    })
    .from(roles)
    .where(and(serverRole, roleApplies(roles, users), eq(roles.role, role)));
  const ownRoles = (where: SQL) =>
    db
      .select({ one: sql`1` })
      .from(roles)
      .where(and(eq(roles.userId, users.id), where));
  return db
    .select({
      user: users,
      role,
      roleVia: sql<AdminUser["roleVia"]>`(${roleVia})`,
      registered,
      invitationExpired: sql<boolean>`(${and(isNull(users.registeredAt), exists(ownRoles(sql`${roles.grantedAt} < now() - interval '3 months'`)))})`,
      rolesDisabled: sql<number>`(${db
        .select({ n: sql`count(*)::int` })
        .from(roles)
        .where(and(eq(roles.userId, users.id), isNotNull(users.registeredAt), not(roleApplies(roles, users))))})`,
      linked: sql<boolean>`${exists(
        db
          .select({ one: sql`1` })
          .from(identities)
          .where(
            and(eq(identities.userId, users.id), sql`rtrim(${identities.iss}, '/') = rtrim(${issuer}::text, '/')`),
          ),
      )}`,
      studies: sql<number>`(${db
        .select({ n: sql`count(*)::int` })
        .from(studies)
        .where(eq(studies.ownerId, users.id))})`,
    })
    .from(users)
    .$dynamic();
}

type UserRow = Awaited<ReturnType<ReturnType<typeof selectUsers>["execute"]>>[number];

async function toAdminUser(db: Db, { user, ...row }: UserRow): Promise<AdminUser> {
  return {
    id: user.id,
    email: user.email,
    role: row.role,
    roleVia: row.roleVia,
    registered: row.registered,
    invitationExpired: row.invitationExpired,
    rolesDisabled: row.rolesDisabled,
    hasMfa: user.hasMfa,
    emailVerified: user.emailVerified,
    linked: row.linked,
    planId: user.planId,
    limits: user.limits,
    effectiveLimits: await effectiveLimits(db, user.id),
    blockedAt: user.blockedAt,
    created: user.created,
    lastLogin: user.lastLoginAt,
    studies: row.studies,
  };
}

/** Studies with their owner and how much they hold. */
function selectStudies(db: Db) {
  const counted = (table: typeof units | typeof coderSessions | typeof annotationValues, where?: SQL) =>
    sql<number>`(${db
      .select({ n: sql`count(*)::int` })
      .from(table)
      .where(and(eq(table.studyId, studies.id), where))})`;
  return db
    .select({
      id: studies.id,
      name: studies.name,
      owner: users.email,
      created: studies.created,
      archived: studies.archived,
      suspendedAt: studies.suspendedAt,
      units: counted(units, sql`${units.inDraft}`),
      coders: counted(coderSessions),
      answers: counted(annotationValues),
    })
    .from(studies)
    .leftJoin(users, eq(users.id, studies.ownerId))
    .$dynamic();
}

export function admin(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  app.use("/admin/*", requireResearcher(server, { role: "admin" }));

  /** Server roles of email domains (not of a user). */
  const domainRoles = and(serverRole, isNull(roles.userId));

  /** The current login provider's issuer (whether users linked a login there). */
  const issuer = () => server.login?.oidc.issuer ?? "";

  const log = (c: Context<Env>, action: string, target: string, details: object = {}) =>
    db
      .insert(adminLog)
      .values({ admin: c.get("researcher").email, action, target, details: details as Record<string, unknown> });

  // ---- warnings and settings ---------------------------------------------------

  app.get("/admin/warnings", async (c) => c.json(await serverWarnings(server)));

  app.get("/admin/settings", async (c) => c.json(await getSettings(db)));

  app.put("/admin/settings", async (c) => {
    const settings = await parseJson(c, ServerSettingsSchema, "message");
    await getSettings(db); // the row exists
    // Open registration is a role: researcher, for every user with an email address
    await db.delete(roles).where(everyoneResearcher);
    if (settings.registration.open)
      await db.insert(roles).values({ role: "researcher", grantedBy: c.get("researcher").email });
    await db.update(serverSettings).set({
      registration: { requests: settings.registration.requests },
      defaultPlanId: settings.defaultPlanId,
      unitBytes: settings.unitBytes,
      answerBytes: settings.answerBytes,
    });
    await log(c, "settings", "server", settings);
    return c.json(await getSettings(db));
  });

  // ---- plans and domains -------------------------------------------------------

  app.get("/admin/plans", async (c) => c.json(await db.select().from(plans).orderBy(asc(plans.name))));

  app.post("/admin/plans", async (c) => {
    const plan = await parseJson(c, PlanWriteSchema, "message");
    const [row] = await db.insert(plans).values({ name: plan.name, limits: plan.limits }).returning();
    await log(c, "create plan", plan.name, plan.limits);
    return c.json(row, 201);
  });

  app.put("/admin/plans/:id", async (c) => {
    const plan = await parseJson(c, PlanWriteSchema, "message");
    const [row] = await db
      .update(plans)
      .set({ name: plan.name, limits: plan.limits })
      .where(eq(plans.id, idParam(c, "id")))
      .returning();
    if (!row) throw new HttpError(404, "Plan not found");
    await log(c, "update plan", plan.name, plan.limits);
    return c.json(row);
  });

  app.delete("/admin/plans/:id", async (c) => {
    const id = idParam(c, "id");
    if ((await getSettings(db)).defaultPlanId === id)
      throw new HttpError(409, "This is the default plan: choose another default first");
    const [row] = await db.delete(plans).where(eq(plans.id, id)).returning({ name: plans.name });
    if (!row) throw new HttpError(404, "Plan not found");
    await log(c, "delete plan", row.name);
    return c.body(null, 204);
  });

  // A domain rule: a researcher role for users with an email address there, and/or their plan
  app.get("/admin/domains", async (c) => {
    const researcherDomains = await db
      .select({ domain: sql<string>`${roles.emailDomain}` })
      .from(roles)
      .where(and(domainRoles, isNotNull(roles.emailDomain)));
    const planned = new Map((await db.select().from(domainPlans)).map((d) => [d.domain, d.planId]));
    const researchers = new Set(researcherDomains.map((r) => r.domain));
    const domains = [...new Set([...researchers, ...planned.keys()])].sort();
    return c.json(
      domains.map((domain) => ({ domain, researcher: researchers.has(domain), planId: planned.get(domain) ?? null })),
    );
  });

  app.put("/admin/domains/:domain", async (c) => {
    const domain = DomainSchema.safeParse(c.req.param("domain"));
    if (!domain.success) throw new HttpError(400, "A domain like uni.nl or *.uni.nl");
    const rule = await parseJson(c, DomainRuleWriteSchema, "message");
    await db.transaction(async (tx) => {
      await tx.delete(roles).where(and(domainRoles, eq(roles.emailDomain, domain.data)));
      if (rule.researcher)
        await tx
          .insert(roles)
          .values({ role: "researcher", emailDomain: domain.data, grantedBy: c.get("researcher").email });
      await tx.delete(domainPlans).where(eq(domainPlans.domain, domain.data));
      if (rule.planId !== null) await tx.insert(domainPlans).values({ domain: domain.data, planId: rule.planId });
    });
    await log(c, "domain", domain.data, rule);
    return c.json({ domain: domain.data, ...rule });
  });

  app.delete("/admin/domains/:domain", async (c) => {
    const domain = c.req.param("domain").toLowerCase();
    const deletedRoles = await db
      .delete(roles)
      .where(and(domainRoles, eq(roles.emailDomain, domain)))
      .returning({ id: roles.id });
    const deletedPlans = await db
      .delete(domainPlans)
      .where(eq(domainPlans.domain, domain))
      .returning({ domain: domainPlans.domain });
    if (deletedRoles.length + deletedPlans.length === 0) throw new HttpError(404, "No such domain");
    await log(c, "delete domain", domain);
    return c.body(null, 204);
  });

  // ---- users -------------------------------------------------------------------

  app.get("/admin/users", async (c) => {
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const rows = await selectUsers(db, issuer())
      .where(q === "" ? undefined : like(users.email, `%${q}%`))
      .orderBy(sql`${users.lastLoginAt} DESC NULLS LAST`, desc(users.id))
      .limit(200);
    return c.json(await Promise.all(rows.map((r) => toAdminUser(db, r))));
  });

  const adminUser = async (id: number) => {
    const [row] = await selectUsers(db, issuer()).where(eq(users.id, id));
    if (!row) throw new HttpError(404, "User not found");
    return toAdminUser(db, row);
  };

  app.post("/admin/users", async (c) => {
    const user = await parseJson(c, AdminUserCreateSchema, "message");
    if (user.role === "admin") checkSensitive(server, c.get("researcher"));
    const email = user.email.trim().toLowerCase();
    // A user with this email, else an invitation: a shadow user, claimed at their first login
    const id = await db.transaction(async (tx) => {
      const { id } = await userForEmail(tx, email);
      await setServerRole(tx, id, user.role, c.get("researcher").email);
      if (user.planId != null) await tx.update(users).set({ planId: user.planId }).where(eq(users.id, id));
      return id;
    });
    await log(c, "add user", email, { role: user.role, planId: user.planId ?? null });
    return c.json(await adminUser(id), 201);
  });

  // Withdraws an invitation (a shadow user, with its roles)
  app.delete("/admin/users/:id", async (c) => {
    const id = idParam(c, "id");
    const user = await adminUser(id);
    if (user.registered) throw new HttpError(409, "This user has logged in: block them instead");
    await db.delete(users).where(and(eq(users.id, id), isNull(users.registeredAt)));
    await log(c, "withdraw invitation", user.email);
    return c.body(null, 204);
  });

  app.put("/admin/users/:id", async (c) => {
    const id = idParam(c, "id");
    const update = await parseJson(c, AdminUserUpdateSchema, "message");
    const before = await adminUser(id);
    if (id === c.get("researcher").userId && (update.blocked || (update.role && update.role !== "admin"))) {
      throw new HttpError(409, "You can't block yourself or take away your own admin role");
    }
    // Giving or taking the admin role is sensitive (researcher/auth.ts)
    if (update.role && update.role !== before.role && (update.role === "admin" || before.role === "admin"))
      checkSensitive(server, c.get("researcher"));
    await db.transaction(async (tx) => {
      if (update.role) await setServerRole(tx, id, update.role, c.get("researcher").email);
      // The safeguards turned their roles off: restored (their dates count from now)
      if (update.restoreRoles)
        await tx
          .update(roles)
          .set({ grantedAt: sql`now()` })
          .where(eq(roles.userId, id));
      const user = eq(users.id, id);
      if (update.planId !== undefined) await tx.update(users).set({ planId: update.planId }).where(user);
      if (update.limits) await tx.update(users).set({ limits: update.limits }).where(user);
      if (update.blocked === true) {
        await tx
          .update(users)
          .set({ blockedAt: sql`COALESCE(${users.blockedAt}, now())` })
          .where(user);
        // Blocked: their logins end now (API keys stop working too, shared/accounts.ts).
        await tx.delete(sessions).where(eq(sessions.userId, id));
      }
      if (update.blocked === false) await tx.update(users).set({ blockedAt: null }).where(user);
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
    return c.json(await adminUser(id));
  });

  // ---- becoming a researcher ---------------------------------------------------

  app.get("/admin/requests", async (c) =>
    c.json(
      await db
        .select({
          userId: researcherRequests.userId,
          email: users.email,
          message: researcherRequests.message,
          at: researcherRequests.at,
        })
        .from(researcherRequests)
        .innerJoin(users, eq(users.id, researcherRequests.userId))
        .where(isNull(researcherRequests.decidedAt))
        .orderBy(asc(researcherRequests.at)),
    ),
  );

  app.post("/admin/requests/:userId", async (c) => {
    const userId = idParam(c, "userId");
    const { approve } = await parseJson(c, ResearcherRequestDecisionSchema, "message");
    const [row] = await db
      .update(researcherRequests)
      .set({ decidedAt: sql`now()`, decidedBy: c.get("researcher").email, approved: approve })
      .from(users)
      .where(
        and(
          eq(researcherRequests.userId, userId),
          eq(users.id, researcherRequests.userId),
          isNull(researcherRequests.decidedAt),
        ),
      )
      .returning({ email: users.email, role: accountRole(users.id) });
    if (!row) throw new HttpError(404, "No open request from this user");
    if (approve && row.role === "user") {
      await setServerRole(db, userId, "researcher", c.get("researcher").email);
    }
    await log(c, approve ? "approve request" : "deny request", row.email);
    return c.body(null, 204);
  });

  // ---- studies --------------------------------------------------------------------

  app.get("/admin/studies", async (c) => c.json(await selectStudies(db).orderBy(desc(studies.id))));

  app.put("/admin/studies/:id", async (c) => {
    const id = idParam(c, "id");
    const update = await parseJson(c, AdminStudyUpdateSchema, "message");
    const [study] = await db.select({ name: studies.name }).from(studies).where(eq(studies.id, id));
    if (!study) throw new HttpError(404, "Study not found");
    if (update.owner !== undefined) {
      const [owner] = await db
        .select({ id: users.id, role: accountRole(users.id) })
        .from(users)
        .where(and(eq(users.email, update.owner.toLowerCase()), isNotNull(users.registeredAt)))
        .orderBy(sql`${users.lastLoginAt} DESC NULLS LAST`)
        .limit(1);
      if (!owner || owner.role === "user")
        throw new HttpError(400, "The new owner must be a researcher on this server");
      await db.update(studies).set({ ownerId: owner.id }).where(eq(studies.id, id));
    }
    if (update.suspended !== undefined) {
      await db
        .update(studies)
        .set({ suspendedAt: update.suspended ? sql`COALESCE(${studies.suspendedAt}, now())` : null })
        .where(eq(studies.id, id));
      // Coders are refused from now on (the runtime loads again, runtime/store.ts).
      server.deployments.drop(id);
    }
    await log(
      c,
      update.suspended === true ? "suspend study" : update.suspended === false ? "resume study" : "update study",
      `#${id} ${study.name}`,
      update,
    );
    const [updated] = await selectStudies(db).where(eq(studies.id, id));
    return c.json(updated!);
  });

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
