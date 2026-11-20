import type { Context, Next } from "hono";
import { accountRoleAtLeast, type AccountRole, type Role } from "@annotinder/contracts";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { roles, studies } from "../db/schema/index.js";
import { studyRole } from "../db/sql.js";
import { row as dbRow } from "../db/index.js";
import { HttpError } from "../shared/http.js";
import type { Env, Server } from "../context.js";
import { getCookie } from "hono/cookie";
import { ensureUser, userForKey } from "../shared/accounts.js";
import { userForSession } from "../shared/sessions.js";
import { CLIENT_HEADER } from "../runtime/session.js";
import { isFresh, SESSION_COOKIE } from "./login.js";

// Researcher authentication (docs/api/researcher.md).
//
// - Session cookie, after logging in (researcher/login.ts), with the
//   `x-annotinder: 1` header on every request: a cross-site form or image
//   can't send it, so it blocks CSRF.
// - API keys: `authorization: Bearer <key>` (shared/accounts.ts).
//
// Both identify a user (an identity at the login provider, docs/accounts.md);
// their role in a study and their account role (user, researcher, admin)
// come from `roles` (`studyRole()`, `accountRole()` in db/sql.ts). Researcher access needs a login with a second factor
// (the provider's, `OIDC_MFA_CLAIM`): a login without one only gets
// `GET /me` and logging out. API keys count as with one (making one needs
// it), but never do sensitive actions (`requireSensitive`): those need a
// web session whose second factor is recent (step-up).
// - Development only (`devMode`, AUTH_DEV_MODE=1): plain
//   `x-dev-role` / `x-dev-email` headers (a registered user with that email),
//   checked against nothing but the study's roles, and `x-dev-account-role`
//   (default admin). A study without user roles lets any dev role through.
//   Never on a reachable server (index.ts: localhost only).

const ROLE_RANK: Record<Role, number> = { READ: 0, WRITE: 1, ADMIN: 2 };

/** What still works in a suspended study besides reading: deleting it, or coders' data. */
const SUSPENDED_ALLOWED = [
  /^\/api\/study\/\d+$/,
  /^\/api\/study\/\d+\/coders\/delete$/,
  /^\/api\/study\/\d+\/coders\/\d+\/deletion-request\/postpone$/,
];

/** Ids are Postgres INTEGERs. */
const MAX_ID = 2 ** 31 - 1;

/** Who a researcher request is from. */
export interface Researcher {
  email: string;
  userId: number;
  /** What they may do on this server. */
  accountRole: AccountRole;
  /** How the request authenticated: a web session, an API key, or development headers. */
  via: "session" | "key" | "dev";
  /** The login used a second factor (API keys: yes, see above). */
  mfa: boolean;
  /** Sessions: when the provider authenticated the user (step-up). */
  authTime: Date | null;
  /** Development headers only: the role the request claims. */
  devRole?: Role;
  /** A server admin whose login had no second factor: they work as a researcher until they log in with one. */
  adminOff?: boolean;
}

async function authenticate(c: Context, server: Server): Promise<Researcher | null> {
  const bearer = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")?.[1];
  if (bearer) {
    const user = await userForKey(server.db, bearer.trim());
    return user
      ? { email: user.email, userId: user.id, accountRole: user.role, via: "key", mfa: true, authTime: null }
      : null;
  }
  const session = getCookie(c, SESSION_COOKIE);
  if (session && c.req.header(CLIENT_HEADER) === "1") {
    const user = await userForSession(server.db, session);
    if (user) {
      // Server admin access needs a login with a second factor (unless AUTH_INSECURE_DISABLE_2FA)
      const adminOff = user.role === "admin" && !user.mfa && !server.insecure.disable2fa;
      return {
        email: user.email,
        userId: user.id,
        accountRole: adminOff ? "researcher" : user.role,
        via: "session",
        mfa: user.mfa,
        authTime: user.authTime,
        ...(adminOff ? { adminOff } : {}),
      };
    }
  }
  const devRole = c.req.header("x-dev-role") as Role | undefined;
  if (server.devMode && devRole && devRole in ROLE_RANK) {
    const accountRole = (c.req.header("x-dev-account-role") as AccountRole | undefined) ?? "admin";
    const user = await ensureUser(server.db, c.req.header("x-dev-email") ?? "dev@localhost");
    return { email: user.email, userId: user.id, devRole, accountRole, via: "dev", mfa: true, authTime: null };
  }
  return null;
}

/** The researcher's role in a study, if any. */
async function roleIn(server: Server, researcher: Researcher, studyId: number): Promise<Role | null> {
  const row = await dbRow<{ role: Role | null }>(
    server.db,
    sql`SELECT ${studyRole(studyId, researcher.userId)} AS role`,
  );
  if (!researcher.devRole) return row?.role ?? null;
  // Development: a study without user roles lets any role through; otherwise the
  // header can't claim more than was granted.
  if (!row?.role)
    return (await server.db.$count(roles, and(eq(roles.studyId, studyId), isNotNull(roles.userId)))) > 0
      ? null
      : researcher.devRole;
  return ROLE_RANK[row.role] < ROLE_RANK[researcher.devRole] ? null : researcher.devRole;
}

/** Until when a researcher may do sensitive actions without logging in again; null: not now (docs/security.md "Step-up"). */
export function freshUntil(server: Server, researcher: Researcher): Date | null {
  if (researcher.via === "dev") return new Date(Date.now() + server.stepUpMaxAge * 1000);
  if (
    researcher.via !== "session" ||
    !isFresh(researcher, server.stepUpMaxAge, { requireMfa: !server.insecure.disable2fa })
  )
    return null;
  return new Date(researcher.authTime!.getTime() + server.stepUpMaxAge * 1000);
}

/**
 * Checks a sensitive action (creating or revoking API keys, deleting
 * answers or coders' data, deleting a study, giving or taking admin roles):
 * never with an API key (403 `not_with_api_key`), and only with a recent
 * login, with a second factor unless `AUTH_INSECURE_DISABLE_2FA` (403
 * `step_up_required`: the client logs in again with
 * `?stepUp=1`). Development headers pass. Call after authentication.
 */
export function checkSensitive(server: Server, researcher: Researcher): void {
  if (researcher.via === "key")
    throw new HttpError(403, "This can't be done with an API key: use the web client", "not_with_api_key");
  if (!freshUntil(server, researcher)) {
    const how = server.insecure.disable2fa ? "log in again" : "log in again with your second factor";
    throw new HttpError(403, `Confirm it's you: ${how} to do this`, "step_up_required");
  }
}

/** Middleware: `checkSensitive` for every request of the route (after an authentication middleware). */
export function requireSensitive(server: Server) {
  return async (c: Context<Env>, next: Next) => {
    checkSensitive(server, c.get("researcher"));
    await next();
  };
}

/**
 * Middleware: an authenticated user (401 otherwise), as `researcher`; with
 * `role`, at least that account role (403). Researchers work without a
 * second factor; server admin access needs one (403 `mfa_required` for an
 * admin whose login had none).
 */
export function requireResearcher(server: Server, { role }: { role?: AccountRole } = {}) {
  return async (c: Context<Env>, next: Next) => {
    const researcher = await authenticate(c, server);
    if (!researcher) return c.json({ error: "Unauthorized" }, 401);
    if (role && !accountRoleAtLeast(researcher.accountRole, role)) {
      if (role === "admin" && researcher.adminOff)
        return c.json(
          {
            error: "Server admin access needs a login with a second factor: log in again with one",
            code: "mfa_required",
          },
          403,
        );
      return c.json({ error: `This needs a ${role} account`, code: `${role}_required` }, 403);
    }
    c.set("researcher", researcher);
    await next();
  };
}

/**
 * Middleware: an authenticated researcher with at least `minRole` in the study
 * of the `:studyId` path param. 401 without (valid) credentials, 404 for an
 * unknown study, 403 without the role.
 */
export function requireStudyUser(server: Server, minRole: Role) {
  return async (c: Context<Env>, next: Next) => {
    const researcher = await authenticate(c, server);
    if (!researcher) return c.json({ error: "Unauthorized" }, 401);

    const raw = c.req.param("studyId");
    const studyId = raw ? Number(raw) : NaN;
    if (!Number.isInteger(studyId) || studyId <= 0 || studyId > MAX_ID)
      return c.json({ error: "Invalid study id" }, 400);
    const [study] = await server.db
      .select({ suspendedAt: studies.suspendedAt })
      .from(studies)
      .where(eq(studies.id, studyId));
    if (!study) return c.json({ error: "Study not found" }, 404);
    // Suspended by a server admin: reading, and deleting data or the study, still work.
    if (study.suspendedAt && c.req.method !== "GET" && !SUSPENDED_ALLOWED.some((p) => p.test(c.req.path))) {
      return c.json(
        { error: "A server admin suspended this study: it can't be changed", code: "study_suspended" },
        403,
      );
    }

    const role = await roleIn(server, researcher, studyId);
    if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) return c.json({ error: "Forbidden" }, 403);
    c.set("researcher", researcher);
    c.set("studyUser", { email: researcher.email, role });
    c.set("studyId", studyId);
    await next();
  };
}
