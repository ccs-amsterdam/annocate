import type { Context, Next } from "hono";
import type { DatabaseSync } from "node:sqlite";
import type { Role } from "@annotinder/contracts";

// Deliberately minimal, dev-only authentication (design plan §6/2.4: "minimal
// unsigned/dev-mode session handling; defer HMAC signing to Phase 6"). None
// of this is meant to be secure -- it exists so the mock server can exercise
// role-gated and coder-scoped endpoints during development/testing.
//
// Job users authenticate via plain headers (no password/token exchange):
//   x-dev-role:  ADMIN | WRITE | READ
//   x-dev-email: any string, used only for job_users lookups/display
//
// As a bootstrap convenience, if a job has zero `job_users` rows yet (a fresh
// job), any request with `x-dev-role` set is treated as authorized -- there's
// no one to lock out yet. Once users are added via `PUT /job/:id/users`, the
// supplied email must match a row with a sufficient role.
//
// Coders authenticate via a client-generated, persisted key:
//   x-coder-key: a stable random string the client stores locally
// combined, on first use, with `x-invite-secret` (from an invite link) to
// create the coder row. Subsequent requests only need `x-coder-key`.

const ROLE_RANK: Record<Role, number> = { READ: 0, WRITE: 1, ADMIN: 2 };

export interface JobUserAuth {
  email: string;
  role: Role;
}

export function authenticateJobUser(c: Context, db: DatabaseSync, jobId: number): JobUserAuth | null {
  const role = c.req.header("x-dev-role") as Role | undefined;
  const email = c.req.header("x-dev-email") ?? "dev@localhost";
  if (!role || !(role in ROLE_RANK)) return null;

  const existingUsers = db.prepare("SELECT 1 FROM job_users WHERE jobId = ?").get(jobId);
  if (!existingUsers) {
    // Bootstrap: no job users configured yet, allow any dev-role header through.
    return { email, role };
  }

  const row = db.prepare("SELECT role FROM job_users WHERE jobId = ? AND email = ?").get(jobId, email) as
    | { role: Role }
    | undefined;
  if (!row) return null;
  if (ROLE_RANK[row.role] < ROLE_RANK[role]) return null; // header can't claim a higher role than granted
  return { email, role: row.role };
}

/**
 * Hono middleware factory: requires an authenticated job user with at least
 * `minRole`, for the job identified by the `:jobId` or `:id` path param
 * (design plan §2: a server hosts any number of jobs, so -- unlike the old
 * single-job-per-deployment bootstrap -- jobId always comes from the URL,
 * never "the only job on this server").
 */
export function requireJobUser(db: DatabaseSync, minRole: Role) {
  return async (c: Context, next: Next) => {
    const raw = c.req.param("jobId") ?? c.req.param("id");
    const jobId = raw ? Number(raw) : NaN;
    if (!Number.isInteger(jobId)) return c.json({ error: "Invalid job id" }, 400);

    const job = db.prepare("SELECT 1 FROM jobs WHERE id = ?").get(jobId);
    if (!job) return c.json({ error: "Job not found" }, 404);

    const auth = authenticateJobUser(c, db, jobId);
    if (!auth || ROLE_RANK[auth.role] < ROLE_RANK[minRole]) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("jobUser", auth);
    c.set("jobId", jobId);
    await next();
  };
}

export interface CoderRow {
  id: number;
  jobId: number;
  email: string | null;
  devKey: string;
  variables: string;
  doneUnitIds: string;
}

/**
 * Hono middleware: resolves (creating if necessary, via an invite secret)
 * the requesting coder. Coder-facing routes are unscoped in the URL (no
 * `/job/:jobId` prefix) -- a coder's job is implied by their existing coder
 * row (looked up by devKey alone) or, for a brand-new coder, by the job that
 * owns the invite secret they present (invite secrets are unique across the
 * whole deployment).
 */
export function requireCoder(db: DatabaseSync) {
  return async (c: Context, next: Next) => {
    const coderKey = c.req.header("x-coder-key");
    if (!coderKey) return c.json({ error: "Missing x-coder-key header" }, 401);

    let coder = db.prepare("SELECT * FROM coders WHERE devKey = ?").get(coderKey) as CoderRow | undefined;

    if (!coder) {
      const secret = c.req.header("x-invite-secret");
      if (!secret) return c.json({ error: "Unknown coder; provide x-invite-secret to create one" }, 401);
      const invite = db.prepare("SELECT * FROM invites WHERE secret = ?").get(secret) as
        | { jobId: number }
        | undefined;
      if (!invite) return c.json({ error: "Invalid invite secret" }, 401);

      db.prepare("INSERT INTO coders (jobId, devKey, variables, doneUnitIds) VALUES (?, ?, '{}', '{}')").run(
        invite.jobId,
        coderKey,
      );
      coder = db.prepare("SELECT * FROM coders WHERE devKey = ?").get(coderKey) as unknown as CoderRow;
    }

    c.set("coder", coder);
    c.set("jobId", coder.jobId);
    await next();
  };
}
