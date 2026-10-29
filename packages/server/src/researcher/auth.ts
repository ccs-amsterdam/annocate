import type { Context, Next } from "hono";
import { accountRoleAtLeast, type AccountRole, type Role } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Env, Server } from "../context.js";
import { getCookie } from "hono/cookie";
import { userForKey } from "../shared/accounts.js";
import { userForSession } from "../shared/sessions.js";
import { CLIENT_HEADER } from "../runtime/session.js";
import { SESSION_COOKIE } from "./login.js";

// Researcher authentication (docs/api/researcher.md).
//
// - Session cookie, after logging in (researcher/login.ts), with the
//   `x-annotinder: 1` header on every request: a cross-site form or image
//   can't send it, so it blocks CSRF.
// - API keys: `authorization: Bearer <key>` (shared/accounts.ts).
//
// Both identify a user by email; their role in a job is in `job_users`,
// their account role (user, researcher, admin) on the user
// (docs/accounts.md). With `requireMfa`, a login without a second factor
// only gets `GET /me` (API keys count as with one: making one needs it).
// - Development only (`devAuth`, ANNOTINDER_DEV_AUTH=1): plain
//   `x-dev-role` / `x-dev-email` headers, checked against nothing but
//   `job_users`, and `x-dev-account-role` (default admin). A job without job
//   users lets any dev role through. Never enable this on a reachable server.

const ROLE_RANK: Record<Role, number> = { READ: 0, WRITE: 1, ADMIN: 2 };

/** What still works in a suspended job besides reading: deleting it, or coders' data. */
const SUSPENDED_ALLOWED = [/^\/job\/\d+$/, /^\/job\/\d+\/coders\/delete$/, /^\/job\/\d+\/coders\/\d+\/deletion-request\/postpone$/];

/** Ids are Postgres INTEGERs. */
const MAX_ID = 2 ** 31 - 1;

/** Who a researcher request is from. */
export interface Researcher {
  email: string;
  /** Not set for development headers. */
  userId?: number;
  /** What they may do on this server. */
  accountRole: AccountRole;
  /** The login used a second factor (API keys: yes). */
  mfa: boolean;
  /** Development headers only: the role the request claims. */
  devRole?: Role;
}

async function authenticate(c: Context, server: Server): Promise<Researcher | null> {
  const bearer = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")?.[1];
  if (bearer) {
    const user = await userForKey(server.db, bearer.trim());
    return user ? { email: user.email, userId: user.id, accountRole: user.role, mfa: true } : null;
  }
  const session = getCookie(c, SESSION_COOKIE);
  if (session && c.req.header(CLIENT_HEADER) === "1") {
    const user = await userForSession(server.db, session);
    if (user) return { email: user.email, userId: user.id, accountRole: user.role, mfa: user.mfa };
  }
  const devRole = c.req.header("x-dev-role") as Role | undefined;
  if (server.devAuth && devRole && devRole in ROLE_RANK) {
    const accountRole = (c.req.header("x-dev-account-role") as AccountRole | undefined) ?? "admin";
    return { email: c.req.header("x-dev-email") ?? "dev@localhost", devRole, accountRole, mfa: true };
  }
  return null;
}

/** The researcher's role in a job, if any. */
async function roleIn(server: Server, researcher: Researcher, jobId: number): Promise<Role | null> {
  const row = await one<{ role: Role }>(server.db, "SELECT role FROM job_users WHERE job_id = $1 AND email = $2", [
    jobId,
    researcher.email,
  ]);
  if (!researcher.devRole) return row?.role ?? null;
  // Development: a job without job users lets any role through; otherwise the
  // header can't claim more than was granted.
  if (!row) return (await one(server.db, "SELECT 1 FROM job_users WHERE job_id = $1", [jobId])) ? null : researcher.devRole;
  return ROLE_RANK[row.role] < ROLE_RANK[researcher.devRole] ? null : researcher.devRole;
}

/** Whether the server requires a second factor and this login lacks one. */
const lacksMfa = (server: Server, researcher: Researcher) => server.requireMfa && !researcher.mfa;
const MFA_REQUIRED = { error: "This server requires a login with a second factor", code: "mfa_required" } as const;

/**
 * Middleware: an authenticated user (401 otherwise), as `researcher`; with
 * `role`, at least that account role (403). A login without a required
 * second factor is refused (403 `mfa_required`) unless `withoutMfa`.
 */
export function requireResearcher(server: Server, { role, withoutMfa = false }: { role?: AccountRole; withoutMfa?: boolean } = {}) {
  return async (c: Context<Env>, next: Next) => {
    const researcher = await authenticate(c, server);
    if (!researcher) return c.json({ error: "Unauthorized" }, 401);
    if (!withoutMfa && lacksMfa(server, researcher)) return c.json(MFA_REQUIRED, 403);
    if (role && !accountRoleAtLeast(researcher.accountRole, role)) {
      return c.json({ error: `This needs a ${role} account`, code: `${role}_required` }, 403);
    }
    c.set("researcher", researcher);
    await next();
  };
}

/**
 * Middleware: an authenticated researcher with at least `minRole` in the job
 * of the `:jobId` path param. 401 without (valid) credentials, 404 for an
 * unknown job, 403 without the role.
 */
export function requireJobUser(server: Server, minRole: Role) {
  return async (c: Context<Env>, next: Next) => {
    const researcher = await authenticate(c, server);
    if (!researcher) return c.json({ error: "Unauthorized" }, 401);
    if (lacksMfa(server, researcher)) return c.json(MFA_REQUIRED, 403);

    const raw = c.req.param("jobId");
    const jobId = raw ? Number(raw) : NaN;
    if (!Number.isInteger(jobId) || jobId <= 0 || jobId > MAX_ID) return c.json({ error: "Invalid job id" }, 400);
    const job = await one<{ suspended_at: Date | null }>(server.db, "SELECT suspended_at FROM jobs WHERE id = $1", [jobId]);
    if (!job) return c.json({ error: "Job not found" }, 404);
    // Suspended by a server admin: reading, and deleting data or the job, still work.
    if (job.suspended_at && c.req.method !== "GET" && !SUSPENDED_ALLOWED.some((p) => p.test(c.req.path))) {
      return c.json({ error: "A server admin suspended this job: it can't be changed", code: "job_suspended" }, 403);
    }

    const role = await roleIn(server, researcher, jobId);
    if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) return c.json({ error: "Forbidden" }, 403);
    c.set("researcher", researcher);
    c.set("jobUser", { email: researcher.email, role });
    c.set("jobId", jobId);
    await next();
  };
}
