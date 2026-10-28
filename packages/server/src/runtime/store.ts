import type { DeviceDetails } from "../shared/devices.js";
import type { DeletionRequest, UnitData, VariableValue } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { coderValues, putCoderValues, toCoder, type CoderRow } from "../shared/coders.js";
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
  CoderAnnotation,
  CoderValuesWrite,
  CoderWrite,
  DeploymentSpec,
  Finished,
  FinishedRequest,
  ResolveCoderRequest,
  ResolvedCoder,
  Unit,
} from "./types.js";

/**
 * What the runtime reads from and writes to the database, for one job: the
 * database (DbStore), or a preview's in-memory stand-in (preview.ts). Async,
 * like any database driver.
 */
export interface Store {
  getDeployment(): Promise<DeploymentSpec>;
  /** Unit content by id; unknown ids are left out. */
  getUnits(ids: number[]): Promise<Unit[]>;
  /** All coders (for researcher status). */
  listCoders(): Promise<Coder[]>;
  /** The coder for a coder key, created from an invite on first use (docs/coder-identity.md). */
  resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder>;
  /** Adds a device to a session (a transfer link): its key now finds this coder. Returns the device's row. */
  addDevice(coderId: number, coderKey: string, device: DeviceDetails): Promise<number | null>;
  putCoder(coderId: number, write: CoderWrite): Promise<void>;
  /** Writes coder-level values (answers outside unit loops, assigned values): answer rows without a unit. */
  putCoderValues(write: CoderValuesWrite): Promise<void>;
  /** Records the coder's request to delete their answers (a new request replaces a postponed one). */
  requestDeletion(coderId: number, request: DeletionRequest): Promise<void>;
  listFinished(request: FinishedRequest): Promise<Finished[]>;
  /** One coder's live annotations per unit, ordered by first write. */
  listAnnotations(coderId: number): Promise<CoderAnnotation[]>;
  putAnnotation(write: AnnotationWrite): Promise<void>;
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
    const values = await coderValues(this.sql, this.jobId);
    return (await this.sql.query<CoderRow>("SELECT * FROM coders WHERE job_id = $1 ORDER BY id", [this.jobId])).map((row) =>
      toCoder(row, values.get(row.id) ?? {}),
    );
  }

  async resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    const { row, deviceId } = await this.sql.transaction((tx) => findOrCreateCoder(tx, this.jobId, request));
    const values = await coderValues(this.sql, this.jobId, row.id);
    return { coder: toCoder(row, values.get(row.id) ?? {}), deviceId };
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

  async putCoder(coderId: number, write: CoderWrite): Promise<void> {
    const updated = await this.sql.query("UPDATE coders SET assignments = $1, ended = $2 WHERE job_id = $3 AND id = $4 RETURNING id", [
      JSON.stringify(write.assignments),
      write.ended === null ? null : JSON.stringify(write.ended),
      this.jobId,
      coderId,
    ]);
    if (updated.length === 0) throw new HttpError(404, "Coder not found");
  }

  async requestDeletion(coderId: number, request: DeletionRequest): Promise<void> {
    await this.sql.query("UPDATE coders SET deletion_request = $1 WHERE job_id = $2 AND id = $3", [JSON.stringify(request), this.jobId, coderId]);
  }

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    return request.loops.length === 0 ? [] : listFinished(this.sql, this.jobId, request);
  }

  async unitVersion(unitId: number, hash: string, data: UnitData): Promise<number> {
    // Inserted once; a second insert (e.g. after a restart) returns the same row.
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

  async listAnnotations(coderId: number): Promise<CoderAnnotation[]> {
    const rows = await this.sql.query<{ unitId: number; coderId: number; variable: string; value: VariableValue; created: Date; updated: Date }>(
      `SELECT unit_id AS "unitId", coder_id AS "coderId", variable, value, created, updated FROM annotation_values
       WHERE job_id = $1 AND coder_id = $2 AND unit_id IS NOT NULL AND retired_at IS NULL ORDER BY created, id`,
      [this.jobId, coderId],
    );
    const byUnit = new Map<number, CoderAnnotation>();
    for (const row of rows) {
      let annotation = byUnit.get(row.unitId);
      if (!annotation) {
        annotation = { unitId: row.unitId, coderId: row.coderId, variables: {}, created: row.created, updated: row.updated };
        byUnit.set(row.unitId, annotation);
      }
      annotation.variables[row.variable] = row.value;
      if (row.updated > annotation.updated) annotation.updated = row.updated;
    }
    return [...byUnit.values()];
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
          `INSERT INTO annotation_values (job_id, unit_id, coder_id, variable, value, codebook_id, unit_version_id, device_id, created, updated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
           ON CONFLICT (unit_id, coder_id, variable) WHERE retired_at IS NULL
           DO UPDATE SET value = excluded.value, codebook_id = excluded.codebook_id, unit_version_id = excluded.unit_version_id,
             device_id = excluded.device_id, updated = excluded.updated`,
          [jobId, write.unitId, write.coderId, variable, JSON.stringify(value), write.codebookId ?? null, write.unitVersionId ?? null, write.deviceId ?? null],
        );
      }
      if (!unit.coded) await tx.query("UPDATE units SET coded = true WHERE id = $1", [write.unitId]);
    });
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

async function findOrCreateCoder(sql: Sql, jobId: number, request: ResolveCoderRequest): Promise<{ row: CoderRow; deviceId: number }> {
  const { login, coderKey, device } = request;
  if (!request.newSession) {
    const known = await one<CoderRow & { device_id: number }>(
      sql,
      "SELECT c.*, d.id AS device_id FROM coder_devices d JOIN coders c ON c.id = d.coder_id WHERE d.key_hash = $1",
      [coderKey],
    );
    if (known) {
      if (known.job_id !== jobId) throw new HttpError(401, "Coder key belongs to a different job");
      // A login links its email to the session, once. If the email already
      // has a session in this job, this device continues that one instead.
      if (login && known.email === null) {
        const other = await sessionOfEmail(sql, jobId, login.email);
        if (other) return { row: other, deviceId: await addDevice(sql, jobId, other.id, coderKey, device) };
        const linked = await one<CoderRow>(sql, "UPDATE coders SET email = $1 WHERE id = $2 RETURNING *", [login.email.toLowerCase(), known.id]);
        return { row: linked!, deviceId: known.device_id };
      }
      return { row: known, deviceId: known.device_id };
    }
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
