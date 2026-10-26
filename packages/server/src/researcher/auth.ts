import type { Context, Next } from "hono";
import { one, type Sql } from "../db.js";
import type { Role } from "@annotinder/contracts";

// DEV ONLY: not secure, and not real authentication. Job users send plain headers
// and nothing checks them against a password or token. This exists so the
// researcher API can be exercised during development and tests. Real
// researcher identity is not implemented yet.
//
// Job users authenticate via plain headers (no password/token exchange):
//   x-dev-role:  ADMIN | WRITE | READ
//   x-dev-email: any string, used only for job_users lookups/display
//
// As a bootstrap convenience, if a job has zero `job_users` rows yet (a fresh
// job), any request with `x-dev-role` set is treated as authorized -- there's
// no one to lock out yet. Once users are added via `PUT /job/:jobId/users`, the
// supplied email must match a row with a sufficient role.

const ROLE_RANK: Record<Role, number> = { READ: 0, WRITE: 1, ADMIN: 2 };

/** Ids are Postgres INTEGERs. */
const MAX_ID = 2 ** 31 - 1;

export interface JobUserAuth {
  email: string;
  role: Role;
}

export async function authenticateJobUser(c: Context, sql: Sql, jobId: number): Promise<JobUserAuth | null> {
  const role = c.req.header("x-dev-role") as Role | undefined;
  const email = c.req.header("x-dev-email") ?? "dev@localhost";
  if (!role || !(role in ROLE_RANK)) return null;

  const existingUsers = await one(sql, "SELECT 1 FROM job_users WHERE job_id = $1", [jobId]);
  if (!existingUsers) {
    // Bootstrap: no job users configured yet, allow any dev-role header through.
    return { email, role };
  }

  const row = await one<{ role: Role }>(sql, "SELECT role FROM job_users WHERE job_id = $1 AND email = $2", [jobId, email]);
  if (!row) return null;
  if (ROLE_RANK[row.role] < ROLE_RANK[role]) return null; // header can't claim a higher role than granted
  return { email, role: row.role };
}

/**
 * Hono middleware factory: requires an authenticated job user with at least
 * `minRole`, for the job identified by the `:jobId` path param (a server
 * hosts any number of jobs, so jobId always comes from the URL).
 */
export function requireJobUser(sql: Sql, minRole: Role) {
  return async (c: Context, next: Next) => {
    const raw = c.req.param("jobId");
    const jobId = raw ? Number(raw) : NaN;
    if (!Number.isInteger(jobId) || jobId <= 0 || jobId > MAX_ID) return c.json({ error: "Invalid job id" }, 400);

    const job = await one(sql, "SELECT 1 FROM jobs WHERE id = $1", [jobId]);
    if (!job) return c.json({ error: "Job not found" }, 404);

    const auth = await authenticateJobUser(c, sql, jobId);
    if (!auth || ROLE_RANK[auth.role] < ROLE_RANK[minRole]) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("jobUser", auth);
    c.set("jobId", jobId);
    await next();
  };
}
