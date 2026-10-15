import type { Context, Next } from "hono";
import type { DatabaseSync } from "node:sqlite";
import type { Role } from "@annotinder/contracts";

// Deliberately minimal, dev-only authentication. None of this is meant to
// be secure (real coder identity: docs/coder-identity.md) -- it exists so the mock server can exercise
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
 * (a server hosts any number of jobs, so -- unlike the old
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
  assignments: string;
  participantId: string | null;
}

export interface ResolveError {
  error: string;
  status: 401 | 409;
  code?: "participant_has_session" | "auth_required";
}

interface InviteRow {
  id: number;
  jobId: number;
  access: string;
  maxUses: number | null;
  uses: number;
  variables: string;
  participantId: string | null;
  participantFromUrl: number;
}

/**
 * Looks up the coder for a coder key, creating it from an invite secret on
 * first use (docs/coder-identity.md §4). With `jobId` set (backend API: the
 * job server already knows the job), the coder and invite must belong to it.
 *
 * A participant id is only a label: a new coder key for a participant that
 * already has a session is refused (409 `participant_has_session`) unless
 * the coder confirmed starting a new session.
 */
export function resolveCoder(
  db: DatabaseSync,
  coderKey: string,
  inviteSecret: string | undefined,
  jobId?: number,
  options: { participantId?: string; newSession?: boolean } = {},
): CoderRow | ResolveError {
  const coder = db.prepare("SELECT * FROM coders WHERE devKey = ?").get(coderKey) as CoderRow | undefined;
  if (coder) {
    if (jobId !== undefined && coder.jobId !== jobId) return { error: "Coder key belongs to a different job", status: 401 };
    return coder;
  }

  if (!inviteSecret) return { error: "Unknown coder; provide x-invite-secret to create one", status: 401 };
  const invite = db.prepare("SELECT * FROM invites WHERE secret = ?").get(inviteSecret) as InviteRow | undefined;
  if (!invite || (jobId !== undefined && invite.jobId !== jobId)) return { error: "Invalid invite secret", status: 401 };
  if (invite.access === "required" || invite.access === "only_authenticated") {
    return { error: "This invite requires login, which is not supported yet", status: 401, code: "auth_required" };
  }

  const participantId = invite.participantId ?? (invite.participantFromUrl ? options.participantId : undefined) ?? null;
  const knownParticipant =
    participantId !== null &&
    !!db.prepare("SELECT 1 FROM coders WHERE jobId = ? AND participantId = ?").get(invite.jobId, participantId);
  if (knownParticipant && !options.newSession) {
    return {
      error: "This participant already has a session on another device",
      status: 409,
      code: "participant_has_session",
    };
  }
  // A new session of a known participant is the same person: it doesn't use up the invite.
  if (!knownParticipant) {
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      return { error: "This invite has been used up", status: 401 };
    }
    db.prepare("UPDATE invites SET uses = uses + 1 WHERE id = ?").run(invite.id);
  }

  // The invite's preset variables (e.g. `{ slot: "2" }`) become the coder's
  // values for the codebook's `auto` variables with `source: "invite"`.
  const presets = JSON.parse(invite.variables) as Record<string, string>;
  const variables = Object.fromEntries(
    Object.entries(presets).map(([name, code]) => [name, { done: true, skip: false, codes: [{ code }] }]),
  );
  db.prepare(
    "INSERT INTO coders (jobId, devKey, participantId, variables, doneUnitIds, created) VALUES (?, ?, ?, ?, '{}', ?)",
  ).run(invite.jobId, coderKey, participantId, JSON.stringify(variables), new Date().toISOString());
  return db.prepare("SELECT * FROM coders WHERE devKey = ?").get(coderKey) as unknown as CoderRow;
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

    const coder = resolveCoder(db, coderKey, c.req.header("x-invite-secret"), undefined, {
      participantId: c.req.header("x-participant-id"),
      newSession: c.req.header("x-new-session") === "1",
    });
    if ("error" in coder) return c.json({ error: coder.error, code: coder.code }, coder.status);

    c.set("coder", coder);
    c.set("jobId", coder.jobId);
    await next();
  };
}

/**
 * Hono middleware for the backend API (routes/backend.ts): only the job
 * server may call it, authenticated with the shared secret as a bearer
 * token. Dev-grade (constant secret, no request signing) like the rest of
 * this file.
 */
export function requireJobServer(db: DatabaseSync, secret: string) {
  return async (c: Context, next: Next) => {
    if (c.req.header("authorization") !== `Bearer ${secret}`) return c.json({ error: "Unauthorized" }, 401);

    const jobId = Number(c.req.param("jobId"));
    if (!Number.isInteger(jobId)) return c.json({ error: "Invalid job id" }, 400);
    const job = db.prepare("SELECT 1 FROM jobs WHERE id = ?").get(jobId);
    if (!job) return c.json({ error: "Job not found" }, 404);
    c.set("jobId", jobId);
    await next();
  };
}
