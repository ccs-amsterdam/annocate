import type { Context, Next } from "hono";
import type { Role } from "@annotinder/contracts";
import { one } from "../db.js";
import type { Env, Server } from "../context.js";
import { userForKey } from "../shared/accounts.js";

// Researcher authentication (docs/api/researcher.md#authentication).
//
// - API keys: `authorization: Bearer <key>` (shared/accounts.ts). The key
//   identifies a user (by email); their role in a job is in `job_users`.
// - Development only (`devAuth`, ANNOTINDER_DEV_AUTH=1): plain
//   `x-dev-role` / `x-dev-email` headers, checked against nothing but
//   `job_users`. A job without job users lets any dev role through. Never
//   enable this on a reachable server.

const ROLE_RANK: Record<Role, number> = { READ: 0, WRITE: 1, ADMIN: 2 };

/** Ids are Postgres INTEGERs. */
const MAX_ID = 2 ** 31 - 1;

/** Who a researcher request is from. */
export interface Researcher {
  email: string;
  /** Set for API key users. */
  userId?: number;
  /** Development headers only: the role the request claims. */
  devRole?: Role;
}

export interface JobUserAuth {
  email: string;
  role: Role;
}

async function authenticate(c: Context, server: Server): Promise<Researcher | null> {
  const bearer = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")?.[1];
  if (bearer) {
    const user = await userForKey(server.db, bearer.trim());
    return user ? { email: user.email, userId: user.id } : null;
  }
  const devRole = c.req.header("x-dev-role") as Role | undefined;
  if (server.devAuth && devRole && devRole in ROLE_RANK) {
    return { email: c.req.header("x-dev-email") ?? "dev@localhost", devRole };
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

/** Middleware: an authenticated researcher (401 otherwise), as `researcher`. */
export function requireResearcher(server: Server) {
  return async (c: Context<Env>, next: Next) => {
    const researcher = await authenticate(c, server);
    if (!researcher) return c.json({ error: "Unauthorized" }, 401);
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

    const raw = c.req.param("jobId");
    const jobId = raw ? Number(raw) : NaN;
    if (!Number.isInteger(jobId) || jobId <= 0 || jobId > MAX_ID) return c.json({ error: "Invalid job id" }, 400);
    if (!(await one(server.db, "SELECT 1 FROM jobs WHERE id = $1", [jobId]))) return c.json({ error: "Job not found" }, 404);

    const role = await roleIn(server, researcher, jobId);
    if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) return c.json({ error: "Forbidden" }, 403);
    c.set("researcher", researcher);
    c.set("jobUser", { email: researcher.email, role });
    c.set("jobId", jobId);
    await next();
  };
}
