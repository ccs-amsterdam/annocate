import type { DeviceDetails } from "../shared/devices.js";
import type { DeletionRequest, SessionEnd, UnitData, VariableValue } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { coderAnswers, putCoderValues, toCoder, type CoderRow } from "../shared/coders.js";
import { getDeploymentSpec, getPreviewSpec } from "../shared/deployments.js";
import { listFinished } from "../shared/finished.js";
import { HttpError } from "../shared/http.js";
import { sessionFromUrl, type InviteRow } from "../shared/invites.js";
import { getSettings } from "../shared/accounts.js";
import { checkAnswerSize, checkNewCoder, jobLimits } from "../shared/limits.js";
import { unitHash, type UnitRow } from "../shared/units.js";
import type {
  AnnotationWrite,
  Coder,
  Coding,
  CoderValue,
  CoderValuesWrite,
  CoderAssignments,
  DeploymentSpec,
  Finished,
  FinishedRequest,
  ResolveCoderRequest,
  Lease,
  ResolvedCoder,
  Transfer,
  Unit,
} from "./types.js";

/**
 * What the runtime reads from and writes to the database, for one job: the
 * database (DbStore), or a preview's in-memory stand-in (preview.ts). Async,
 * like any database driver.
 */
export interface Store {
  getDeployment(): Promise<DeploymentSpec>;
  /**
   * What tells whether the deployment changed since it was read: its
   * version, annotation epoch and revision (`deployments.revision`), and
   * whether the job is suspended. Read on every request, so every server
   * process sees a change at once. Null: no cheap check (previews), read
   * the deployment itself.
   */
  deploymentStamp(): Promise<string | null>;
  /** Unit content by id; unknown ids are left out. */
  getUnits(ids: number[]): Promise<Unit[]>;
  /** All coders (for researcher status). */
  listCoders(): Promise<Coder[]>;
  /** The coder for a coder key, created from an invite on first use (docs/coder-identity.md). */
  resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder>;
  /** Adds a device to a session (a transfer link): its key now finds this coder. Returns the device's row. */
  addDevice(coderId: number, coderKey: string, device: DeviceDetails): Promise<number | null>;
  /** Stores where the coder is routed in a loop: one branch's routing (`CoderAssignments`), next to the others. */
  routeCoder(coderId: number, branch: string, assignment: CoderAssignments[string]): Promise<void>;
  /** Stores how the session ended (null: reopened). */
  setEnded(coderId: number, ended: SessionEnd | null): Promise<void>;
  /** A "continue on another device" link (only its hash is stored). */
  createTransfer(tokenHash: string, transfer: Transfer): Promise<void>;
  /** Uses up a transfer link: what it was for, if it exists and hasn't expired. */
  redeemTransfer(tokenHash: string, now: Date): Promise<Transfer | null>;
  /** Writes coder-level values (answers outside unit loops, assigned values): answer rows without a unit. Assigned and frozen ones stay. */
  putCoderValues(write: CoderValuesWrite): Promise<void>;
  /** The coder's live coder-level answers, by variable. */
  coderValues(coderId: number): Promise<Record<string, CoderValue>>;
  /** Freezes these coder-level answers of the coder (`CoderValue.frozen`). */
  freezeCoderValues(coderId: number, names: string[]): Promise<void>;
  /** Records the coder's request to delete their answers (a new request replaces a postponed one). */
  requestDeletion(coderId: number, request: DeletionRequest): Promise<void>;
  listFinished(request: FinishedRequest): Promise<Finished[]>;
  /** One coder's live answers for one unit, by variable (empty if none). */
  unitAnswers(coderId: number, unitId: number): Promise<Record<string, VariableValue>>;
  /** Writes one unit's answers, and the codings they finish (`AnnotationWrite.codings`), together. */
  putAnnotation(write: AnnotationWrite): Promise<void>;
  /** Finished codings, oldest first: in a loop, of a coder, or both. */
  listCodings(filter: { loop?: string; coderId?: number }): Promise<Coding[]>;
  /** What the stored codings were derived under (the codebook's loops and the annotation epoch), if anything. */
  codingsBasis(): Promise<string | null>;
  /** Replaces all codings of the job, derived under `basis`. */
  replaceCodings(basis: string, codings: Coding[]): Promise<void>;
  /** The leases of a loop (all coders'), or one coder's (all loops). Also expired ones. */
  listLeases(filter: { loop?: string; coderId?: number }): Promise<Lease[]>;
  /** Stores a lease (a coder holds up to a batch per queue), or renews it. */
  putLease(lease: Lease): Promise<void>;
  /** The values coders have for a coder-level question (for `balanced` assignment). */
  coderValuesOf(variable: string): Promise<VariableValue[]>;
  /**
   * Runs `fn` in one transaction holding a lock on `key` (in this job), with
   * a store that works in that transaction. For decisions that count other
   * coders: picking from a shared queue, giving out sets and groups. The
   * lock is a database lock, so it holds across server processes.
   */
  locked<T>(key: string, fn: (store: Store) => Promise<T>): Promise<T>;
  /**
   * Records that a unit was handed to the coder, in this version: when it
   * first was (the server's bound on their time: docs/coder-identity.md
   * §10), and the version last shown (stored with their answers).
   */
  recordServe(coderId: number, unitId: number, unitVersionId: number): Promise<void>;
  /** The unit version last shown to the coder (`recordServe`), if any. */
  servedVersion(coderId: number, unitId: number): Promise<number | null>;
  /** Refuses answers that are too large, or that would take the job past its limit on answers (shared/limits.ts). */
  checkAnswers(variables: Record<string, VariableValue>): Promise<void>;
  /**
   * The name of the unitset of an invite (for `invitation` mode loops), or
   * null if it has none. `"first"`: of the first invite that has one (previews,
   * whose coders have no invite).
   */
  inviteUnitset(inviteId: number | "first"): Promise<string | null>;
  /**
   * The id of a unit version (a unit as shown: its shown fields), stored
   * the first time it is shown (docs/architecture.md §8.4).
   */
  unitVersion(unitId: number, hash: string, data: UnitData): Promise<number>;
}

/** A job's data in the database. */
export class DbStore implements Store {
  constructor(
    private sql: Sql,
    private jobId: number,
    /** Use the latest codebook instead of the deployed one (previews). */
    private preview = false,
  ) {}

  async deploymentStamp(): Promise<string | null> {
    if (this.preview) return null;
    const row = await one<{ stamp: string }>(
      this.sql,
      `SELECT concat_ws('/', d.version, d.annotation_epoch, d.revision, j.suspended_at IS NOT NULL) AS stamp
       FROM jobs j LEFT JOIN deployments d ON d.job_id = j.id WHERE j.id = $1`,
      [this.jobId],
    );
    return row?.stamp ?? "";
  }

  async getDeployment(): Promise<DeploymentSpec> {
    if (await one(this.sql, "SELECT 1 FROM jobs WHERE id = $1 AND suspended_at IS NOT NULL", [this.jobId])) {
      throw new HttpError(403, "This job isn't available", "job_suspended");
    }
    const spec = this.preview ? await getPreviewSpec(this.sql, this.jobId) : await getDeploymentSpec(this.sql, this.jobId);
    if (!spec) throw new HttpError(404, this.preview ? "Job has no codebook" : "Job is not deployed");
    return spec;
  }

  async getUnits(ids: number[]): Promise<Unit[]> {
    if (ids.length === 0) return [];
    const rows = await this.sql.query<UnitRow>("SELECT * FROM units WHERE job_id = $1 AND id = ANY($2)", [this.jobId, ids]);
    return rows.map((r) => ({ id: r.id, externalId: r.external_id, data: r.data, hash: unitHash(r.external_id, r.data) }));
  }

  async listCoders(): Promise<Coder[]> {
    return (await this.sql.query<CoderRow>("SELECT * FROM coders WHERE job_id = $1 ORDER BY id", [this.jobId])).map(toCoder);
  }

  async resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    // The common case, a device that has a session here: one query.
    const known = request.newSession ? null : await knownCoder(this.sql, this.jobId, request.coderKey);
    const linkable = !!known && request.linkable && known.email === null;
    if (known && !linkable) return { coder: toCoder(known), deviceId: known.device_id };
    // The login only where it matters (read before the transaction: it is another query).
    const login = (await request.login?.()) ?? null;
    if (known && !login) return { coder: toCoder(known), deviceId: known.device_id };
    const { row, deviceId } = await this.sql.transaction((tx) => findOrCreateCoder(tx, this.jobId, request, known, login));
    return { coder: toCoder(row), deviceId };
  }

  coderValues(coderId: number): Promise<Record<string, CoderValue>> {
    return coderAnswers(this.sql, this.jobId, coderId);
  }

  async freezeCoderValues(coderId: number, names: string[]): Promise<void> {
    if (names.length === 0) return;
    await this.sql.query(
      `UPDATE annotation_values SET frozen = true
       WHERE job_id = $1 AND coder_id = $2 AND unit_id IS NULL AND retired_at IS NULL AND NOT frozen AND variable = ANY($3)`,
      [this.jobId, coderId, names],
    );
  }

  async putCoderValues(write: CoderValuesWrite): Promise<void> {
    await this.sql.transaction((tx) => putCoderValues(tx, this.jobId, write));
  }

  async addDevice(coderId: number, coderKey: string, device: DeviceDetails): Promise<number | null> {
    return addDevice(this.sql, this.jobId, coderId, coderKey, device);
  }

  /** The answer size and the job's answer limit, and its answers so far: read again at most once a minute. */
  private answerRules: { at: number; answerBytes: number; max: number | null; count: number } | null = null;

  async checkAnswers(variables: Record<string, VariableValue>): Promise<void> {
    const now = Date.now();
    if (!this.answerRules || now - this.answerRules.at > 60_000) {
      const { answerBytes } = await getSettings(this.sql);
      const { limits } = await jobLimits(this.sql, this.jobId);
      const max = limits.answersPerJob ?? null;
      const count =
        max === null ? 0 : (await one<{ n: number }>(this.sql, "SELECT count(*)::int AS n FROM annotation_values WHERE job_id = $1", [this.jobId]))!.n;
      this.answerRules = { at: now, answerBytes, max, count };
    }
    const rules = this.answerRules;
    for (const [name, value] of Object.entries(variables)) checkAnswerSize(name, value, rules.answerBytes);
    const added = Object.keys(variables).length;
    // Counts rewritten answers too, until the next read: a little early at worst.
    if (rules.max !== null && rules.count + added > rules.max) {
      throw new HttpError(403, "This job has reached its limit on answers", "job_full");
    }
    rules.count += added;
  }

  async routeCoder(coderId: number, branch: string, assignment: CoderAssignments[string]): Promise<void> {
    // Merged into the stored routings, so routings in two loops at once don't overwrite each other.
    const updated = await this.sql.query(
      "UPDATE coders SET assignments = coalesce(assignments, '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb) WHERE job_id = $3 AND id = $4 RETURNING id",
      [branch, JSON.stringify(assignment), this.jobId, coderId],
    );
    if (updated.length === 0) throw new HttpError(404, "Coder not found");
  }

  async setEnded(coderId: number, ended: SessionEnd | null): Promise<void> {
    const updated = await this.sql.query("UPDATE coders SET ended = $1 WHERE job_id = $2 AND id = $3 RETURNING id", [
      ended === null ? null : JSON.stringify(ended),
      this.jobId,
      coderId,
    ]);
    if (updated.length === 0) throw new HttpError(404, "Coder not found");
  }

  async createTransfer(tokenHash: string, transfer: Transfer): Promise<void> {
    await this.sql.query("DELETE FROM transfers WHERE expires < now()");
    await this.sql.query("INSERT INTO transfers (token_hash, job_id, coder_id, participant, expires) VALUES ($1, $2, $3, $4, $5)", [
      tokenHash,
      this.jobId,
      transfer.coderId,
      transfer.participant,
      transfer.expires,
    ]);
  }

  async redeemTransfer(tokenHash: string, now: Date): Promise<Transfer | null> {
    const row = await one<{ coder_id: number; participant: string | null; expires: Date }>(
      this.sql,
      "DELETE FROM transfers WHERE token_hash = $1 AND job_id = $2 RETURNING coder_id, participant, expires",
      [tokenHash, this.jobId],
    );
    if (!row || row.expires <= now) return null;
    return { coderId: row.coder_id, participant: row.participant, expires: row.expires };
  }

  async requestDeletion(coderId: number, request: DeletionRequest): Promise<void> {
    await this.sql.query("UPDATE coders SET deletion_request = $1 WHERE job_id = $2 AND id = $3", [JSON.stringify(request), this.jobId, coderId]);
  }

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    return request.loops.length === 0 ? [] : listFinished(this.sql, this.jobId, request);
  }

  async unitVersion(unitId: number, hash: string, data: UnitData): Promise<number> {
    // Inserted once; usually it exists, so look first (no write per serve).
    const found = await one<{ id: number }>(this.sql, "SELECT id FROM unit_versions WHERE unit_id = $1 AND hash = $2", [unitId, hash]);
    if (found) return found.id;
    const row = await one<{ id: number }>(
      this.sql,
      `INSERT INTO unit_versions (job_id, unit_id, hash, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (unit_id, hash) DO UPDATE SET hash = excluded.hash RETURNING id`,
      [this.jobId, unitId, hash, JSON.stringify(data)],
    );
    return row!.id;
  }

  async inviteUnitset(inviteId: number | "first"): Promise<string | null> {
    const row = await one<{ name: string }>(
      this.sql,
      `SELECT u.name FROM invites i JOIN unitsets u ON u.id = i.unitset_id
       WHERE i.job_id = $1 AND ($2::int IS NULL OR i.id = $2) ORDER BY i.id LIMIT 1`,
      [this.jobId, inviteId === "first" ? null : inviteId],
    );
    return row?.name ?? null;
  }

  async unitAnswers(coderId: number, unitId: number): Promise<Record<string, VariableValue>> {
    const rows = await this.sql.query<{ variable: string; value: VariableValue }>(
      "SELECT variable, value FROM annotation_values WHERE job_id = $1 AND coder_id = $2 AND unit_id = $3 AND retired_at IS NULL",
      [this.jobId, coderId, unitId],
    );
    return Object.fromEntries(rows.map((r) => [r.variable, r.value]));
  }

  async listCodings(filter: { loop?: string; coderId?: number }): Promise<Coding[]> {
    return this.sql.query<Coding>(
      `SELECT loop_key AS loop, unit_id AS "unitId", coder_id AS "coderId", agreement, created, updated FROM unit_codings
       WHERE job_id = $1 AND ($2::text IS NULL OR loop_key = $2) AND ($3::int IS NULL OR coder_id = $3)
       ORDER BY created, unit_id`,
      [this.jobId, filter.loop ?? null, filter.coderId ?? null],
    );
  }

  async codingsBasis(): Promise<string | null> {
    if (this.preview) return null;
    return (await one<{ basis: string | null }>(this.sql, "SELECT codings_basis AS basis FROM deployments WHERE job_id = $1", [this.jobId]))?.basis ?? null;
  }

  async replaceCodings(basis: string, codings: Coding[]): Promise<void> {
    await this.sql.transaction(async (tx) => {
      await tx.query("DELETE FROM unit_codings WHERE job_id = $1", [this.jobId]);
      for (const c of codings) await insertCoding(tx, this.jobId, c);
      await tx.query("UPDATE deployments SET codings_basis = $1 WHERE job_id = $2", [basis, this.jobId]);
    });
  }

  async listLeases(filter: { loop?: string; coderId?: number }): Promise<Lease[]> {
    return this.sql.query<Lease>(
      `SELECT loop_key AS loop, unitset, coder_id AS "coderId", unit_id AS "unitId", expires FROM unit_leases
       WHERE job_id = $1 AND ($2::text IS NULL OR loop_key = $2) AND ($3::int IS NULL OR coder_id = $3)`,
      [this.jobId, filter.loop ?? null, filter.coderId ?? null],
    );
  }

  async putLease(lease: Lease): Promise<void> {
    await this.sql.query(
      `INSERT INTO unit_leases (job_id, loop_key, unitset, coder_id, unit_id, expires) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (job_id, loop_key, unitset, coder_id, unit_id) DO UPDATE SET expires = excluded.expires`,
      [this.jobId, lease.loop, lease.unitset, lease.coderId, lease.unitId, lease.expires],
    );
  }

  async coderValuesOf(variable: string): Promise<VariableValue[]> {
    const rows = await this.sql.query<{ value: VariableValue }>(
      "SELECT value FROM annotation_values WHERE job_id = $1 AND unit_id IS NULL AND variable = $2 AND retired_at IS NULL",
      [this.jobId, variable],
    );
    return rows.map((r) => r.value);
  }

  locked<T>(key: string, fn: (store: Store) => Promise<T>): Promise<T> {
    return this.sql.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${this.jobId}/${key}`]);
      return fn(new DbStore(tx, this.jobId, this.preview));
    });
  }

  /**
   * Upserts a live value per given variable; variables not given are left
   * alone (so values from older codebook versions stay). `created` is kept
   * on update. Also marks the unit coded.
   */
  async putAnnotation(write: AnnotationWrite): Promise<void> {
    const { jobId } = this;
    await this.sql.transaction(async (tx) => {
      const unit = await one<UnitRow>(tx, "SELECT * FROM units WHERE job_id = $1 AND id = $2", [jobId, write.unitId]);
      if (!unit) throw new HttpError(404, "Unit not found");
      for (const [variable, value] of Object.entries(write.variables)) {
        await tx.query(
          `INSERT INTO annotation_values (job_id, unit_id, coder_id, variable, value, codebook_id, unit_version_id, device_id, timing, created, updated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
           ON CONFLICT (unit_id, coder_id, variable) WHERE retired_at IS NULL
           DO UPDATE SET value = excluded.value, codebook_id = excluded.codebook_id, unit_version_id = excluded.unit_version_id,
             device_id = excluded.device_id, timing = excluded.timing, updated = excluded.updated`,
          [
            jobId,
            write.unitId,
            write.coderId,
            variable,
            JSON.stringify(value),
            write.codebookId ?? null,
            write.unitVersionId ?? null,
            write.deviceId ?? null,
            write.timings?.[variable] ? JSON.stringify(write.timings[variable]) : null,
          ],
        );
      }
      for (const coding of write.codings ?? []) {
        const now = new Date();
        await insertCoding(tx, jobId, { loop: coding.loop, unitId: write.unitId, coderId: write.coderId, agreement: coding.agreement, created: now, updated: now });
      }
      if (!unit.coded) await tx.query("UPDATE units SET coded = true WHERE id = $1", [write.unitId]);
    });
  }

  async recordServe(coderId: number, unitId: number, unitVersionId: number): Promise<void> {
    await this.sql.query(
      `INSERT INTO unit_serves (job_id, coder_id, unit_id, unit_version_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (coder_id, unit_id) DO UPDATE SET unit_version_id = excluded.unit_version_id
       WHERE unit_serves.unit_version_id IS DISTINCT FROM excluded.unit_version_id`,
      [this.jobId, coderId, unitId, unitVersionId],
    );
  }

  async servedVersion(coderId: number, unitId: number): Promise<number | null> {
    const row = await one<{ v: number | null }>(this.sql, "SELECT unit_version_id AS v FROM unit_serves WHERE coder_id = $1 AND unit_id = $2", [
      coderId,
      unitId,
    ]);
    return row?.v ?? null;
  }
}

/** Adds a device's key to a session (or moves it there from another one); returns the device row. */
async function addDevice(sql: Sql, jobId: number, coderId: number, coderKey: string, device: DeviceDetails = { type: null, browser: null, os: null }): Promise<number> {
  const row = await one<{ id: number }>(
    sql,
    `INSERT INTO coder_devices (job_id, coder_id, key_hash, device_type, browser, os) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key_hash) DO UPDATE SET coder_id = excluded.coder_id RETURNING id`,
    [jobId, coderId, coderKey, device.type, device.browser, device.os],
  );
  return row!.id;
}

/** The latest session in this job linked to an email (one per email: docs/coder-identity.md §5). */
const sessionOfEmail = (sql: Sql, jobId: number, email: string) =>
  one<CoderRow>(sql, "SELECT * FROM coders WHERE job_id = $1 AND lower(email) = lower($2) ORDER BY id DESC LIMIT 1", [jobId, email]);

/** Stores a finished coding; one finished again keeps its first time and gets the new agreement answers. */
async function insertCoding(sql: Sql, jobId: number, c: Coding): Promise<void> {
  await sql.query(
    `INSERT INTO unit_codings (job_id, loop_key, unit_id, coder_id, agreement, created, updated) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (job_id, loop_key, unit_id, coder_id) DO UPDATE SET agreement = excluded.agreement, updated = excluded.updated`,
    [jobId, c.loop, c.unitId, c.coderId, JSON.stringify(c.agreement), c.created, c.updated],
  );
}

/** The session a device key has in this job, if any. */
async function knownCoder(sql: Sql, jobId: number, coderKey: string): Promise<(CoderRow & { device_id: number }) | null> {
  const known = await one<CoderRow & { device_id: number }>(
    sql,
    "SELECT c.*, d.id AS device_id FROM coder_devices d JOIN coders c ON c.id = d.coder_id WHERE d.key_hash = $1",
    [coderKey],
  );
  if (known && known.job_id !== jobId) throw new HttpError(401, "Coder key belongs to a different job");
  return known ?? null;
}

/**
 * A device's session to link to a login (`known`, without an email yet), or
 * a new device's: found by the login, or created from the invite.
 */
async function findOrCreateCoder(
  sql: Sql,
  jobId: number,
  request: ResolveCoderRequest,
  known: (CoderRow & { device_id: number }) | null,
  login: { email: string } | null,
): Promise<{ row: CoderRow; deviceId: number }> {
  const { coderKey, device } = request;
  if (known && login) {
    // A login links its email to the session, once. If the email already
    // has a session in this job, this device continues that one instead.
    const other = await sessionOfEmail(sql, jobId, login.email);
    if (other) return { row: other, deviceId: await addDevice(sql, jobId, other.id, coderKey, device) };
    const linked = await one<CoderRow>(sql, "UPDATE coders SET email = $1 WHERE id = $2 RETURNING *", [login.email.toLowerCase(), known.id]);
    return { row: linked!, deviceId: known.device_id };
  }
  // A new device of a linked session: logging in finds it.
  if (login && !request.newSession) {
    const mine = await sessionOfEmail(sql, jobId, login.email);
    if (mine) return { row: mine, deviceId: await addDevice(sql, jobId, mine.id, coderKey, device) };
  }
  if (!request.inviteSecret) throw new HttpError(401, "Unknown coder; a valid invite is needed");
  const invite = await one<InviteRow>(sql, "SELECT * FROM invites WHERE secret = $1", [request.inviteSecret]);
  if (!invite || invite.job_id !== jobId) throw new HttpError(401, "Invalid invite secret");
  // An email list means only those people: they log in to show who they are.
  const emails = invite.emails?.length ? invite.emails.map((e) => e.toLowerCase()) : null;
  if ((invite.auth === "required" || emails) && !login) throw new HttpError(401, "This invite requires login", "auth_required");
  if (emails && login && !emails.includes(login.email.toLowerCase())) {
    throw new HttpError(403, "This invitation is for other email addresses", "email_not_invited");
  }
  // Revoked: no new sessions, also not for a known participant (existing sessions go on).
  if (invite.revoked_at !== null) throw new HttpError(401, "This invite has been revoked");
  // A participant id is a label, never a credential: a new device for a
  // known participant gets a *new* session, and only when asked for.
  const { participantId, session } = sessionFromUrl(invite, request.urlParams ?? {});
  const knownParticipant =
    participantId !== null && !!(await one(sql, "SELECT 1 FROM coders WHERE job_id = $1 AND participant_id = $2", [jobId, participantId]));
  if (knownParticipant && !request.newSession) {
    throw new HttpError(409, "This participant already has a session on another device", "participant_has_session");
  }
  if (request.paused) throw new HttpError(409, "This study is paused", "job_paused");
  await checkNewCoder(sql, jobId);
  // A new session of a known participant is the same person: it doesn't use up the invite.
  if (!knownParticipant) {
    // Checked and counted in one statement, so concurrent coders can't overrun `max_uses`.
    const used = await sql.query("UPDATE invites SET uses = uses + 1 WHERE id = $1 AND (max_uses IS NULL OR uses < max_uses) RETURNING id", [
      invite.id,
    ]);
    if (used.length === 0) throw new HttpError(401, "This invite has been used up");
  }
  const created = await one<CoderRow>(
    sql,
    "INSERT INTO coders (job_id, email, participant_id, invite_id, session) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [jobId, login?.email.toLowerCase() ?? null, participantId, invite.id, JSON.stringify(session)],
  );
  // The invite's presets become the coder's values for the codebook's `auto`
  // variables with source "invite".
  const presets = Object.fromEntries(Object.entries(invite.variables).map(([name, value]) => [name, { done: true, skip: false, values: [{ value }] }]));
  await putCoderValues(sql, jobId, { coderId: created!.id, values: presets, assigned: true });
  // A new session on a device that had one (`newSession`): the device moves to the new one.
  return { row: created!, deviceId: await addDevice(sql, jobId, created!.id, coderKey, device) };
}
