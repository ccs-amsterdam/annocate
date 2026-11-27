import { Hono, type Context } from "hono";
import type { Server, Env } from "../context.js";
import { HttpError } from "../shared/http.js";
import { idParam, parseJson } from "../shared/request.js";
import {
  AdminUserCreateSchema,
  AdminUserUpdateSchema,
  ConfirmDeletionSchema,
  type AccountRole,
  type AdminUser,
} from "@annotinder/contracts";
import { and, desc, eq, isNull, like, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { roles, sessions, users } from "../db/schema/index.js";
import {
  accountDeletion,
  deleteAccount,
  holdsAdminRole,
  limitsOf,
  loadLimitRules,
  setServerRole,
  userForEmail,
  type LimitRules,
} from "../shared/accounts.js";
import { adminLogger, likeLiteral, selectUsers, type UserRow } from "../shared/adminQueries.js";
import { listPage } from "../shared/paging.js";
import { forgetDeletedStudy } from "../shared/studies.js";
import { checkSensitive } from "./auth.js";

function toAdminUser({ user, ...row }: UserRow, limitRules: LimitRules): AdminUser {
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
    effectiveLimits: limitsOf(user, limitRules),
    blockedAt: user.blockedAt,
    created: user.created,
    lastLogin: user.lastLoginAt,
    studies: row.studies,
  };
}

/** The users list shows this many at once (the most recently active); searching finds the others. */
const USERS_PAGE = 200;

/** Users: inviting, roles, plans and limits, blocking, deleting. */
export function adminUsers(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  const log = adminLogger(db);

  /** The current login provider's issuer (whether users linked a login there). */
  const issuer = () => server.login?.oidc.issuer ?? "";
  /**
   * Checks a change of who is a server admin, which is sensitive
   * (`checkSensitive`, researcher/auth.ts): giving or taking the admin role
   * (`role`: the role the user gets), and anything else done to someone who
   * holds it (blocking, unblocking, restoring their roles, withdrawing their
   * invitation). `within`: the transaction the change is made in.
   */
  async function checkAdminChange(
    c: Context<Env>,
    userId: number,
    change: { role?: AccountRole } = {},
    within: Db = db,
  ) {
    const isAdmin = await holdsAdminRole(within, userId);
    const becomesAdmin = change.role === undefined ? isAdmin : change.role === "admin";
    const changesRole = change.role !== undefined && isAdmin !== becomesAdmin;
    const touchesAdmin = change.role === undefined && isAdmin;
    if (changesRole || touchesAdmin) await checkSensitive(server, c.get("researcher"), within);
  }

  app.get("/admin/users", async (c) => {
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const rows = await selectUsers(db, issuer())
      .where(q === "" ? undefined : like(users.email, `%${likeLiteral(q)}%`))
      .orderBy(sql`${users.lastLoginAt} DESC NULLS LAST`, desc(users.id));
    // A page of the most recently active: the admin searches for the others (or pages on)
    const page = listPage(
      c,
      "users",
      rows.map((row) => ({ id: row.user.id, row })),
      USERS_PAGE,
    );
    // Plans, domain rules and the default plan are read once for the whole page
    const limitRules = await loadLimitRules(db);
    return c.json({ ...page, users: page.users.map(({ row }) => toAdminUser(row, limitRules)) });
  });

  const adminUser = async (id: number) => {
    const [row] = await selectUsers(db, issuer()).where(eq(users.id, id));
    if (!row) throw new HttpError(404, "User not found");
    return toAdminUser(row, await loadLimitRules(db));
  };

  app.post("/admin/users", async (c) => {
    const user = await parseJson(c, AdminUserCreateSchema);
    const email = user.email.trim().toLowerCase();
    // A user with this email, else an invitation: a shadow user, claimed at their first login
    const id = await db.transaction(async (tx) => {
      const { id } = await userForEmail(tx, email);
      await checkAdminChange(c, id, { role: user.role }, tx);
      await setServerRole(tx, id, user.role, c.get("researcher").email);
      if (user.planId != null) await tx.update(users).set({ planId: user.planId }).where(eq(users.id, id));
      return id;
    });
    await log(c, "add user", email, { role: user.role, planId: user.planId ?? null });
    return c.json(await adminUser(id), 201);
  });

  app.get("/admin/users/:id/deletion", async (c) => {
    const deletion = await accountDeletion(db, idParam(c, "id"));
    if (!deletion) throw new HttpError(404, "User not found");
    return c.json(deletion);
  });

  // An invitation (a shadow user, with its roles) is withdrawn. A registered user's account is
  // deleted as they would delete it themselves (researcher/me.ts): sensitive, confirmed by
  // typing their email address, with the studies only they have a role in.
  app.delete("/admin/users/:id", async (c) => {
    const id = idParam(c, "id");
    const user = await adminUser(id);
    if (!user.registered) {
      await checkAdminChange(c, id);
      await db.delete(users).where(and(eq(users.id, id), isNull(users.registeredAt)));
      await log(c, "withdraw invitation", user.email);
      return c.body(null, 204);
    }
    if (id === c.get("researcher").userId)
      throw new HttpError(409, "This is your own account: delete it on your account page");
    await checkSensitive(server, c.get("researcher"));
    const { confirm } = await parseJson(c, ConfirmDeletionSchema);
    const deleted = await deleteAccount(db, id, confirm);
    for (const study of deleted.studies) await forgetDeletedStudy(server, study.id);
    await log(c, "delete user", deleted.email, {
      studies: deleted.studies.map((study) => `#${study.id} ${study.name}`),
    });
    return c.body(null, 204);
  });

  app.put("/admin/users/:id", async (c) => {
    const id = idParam(c, "id");
    const update = await parseJson(c, AdminUserUpdateSchema);
    const before = await adminUser(id);
    if (id === c.get("researcher").userId && (update.blocked || (update.role && update.role !== "admin"))) {
      throw new HttpError(409, "You can't block yourself or take away your own admin role");
    }
    if (update.role) await checkAdminChange(c, id, { role: update.role });
    if (update.blocked !== undefined || update.restoreRoles) await checkAdminChange(c, id);
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

  return app;
}
