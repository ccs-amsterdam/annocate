import type { VariableValue } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { toCoder, type CoderRow } from "../shared/coders.js";
import { getDeploymentSpec, getPreviewSpec } from "../shared/deployments.js";
import { listFinished } from "../shared/finished.js";
import { HttpError } from "../shared/http.js";
import type { InviteRow } from "../shared/invites.js";
import { unitHash, type UnitRow } from "../shared/units.js";
import type {
  AnnotationWrite,
  Coder,
  CoderAnnotation,
  CoderWrite,
  DeploymentSpec,
  Finished,
  FinishedRequest,
  ResolveCoderRequest,
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
  resolveCoder(request: ResolveCoderRequest): Promise<Coder>;
  putCoder(coderId: number, write: CoderWrite): Promise<void>;
  listFinished(request: FinishedRequest): Promise<Finished[]>;
  /** One coder's live annotations per unit, ordered by first write. */
  listAnnotations(coderId: number): Promise<CoderAnnotation[]>;
  putAnnotation(write: AnnotationWrite): Promise<void>;
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

  async resolveCoder(request: ResolveCoderRequest): Promise<Coder> {
    return toCoder(await this.sql.transaction((tx) => findOrCreateCoder(tx, this.jobId, request)));
  }

  async putCoder(coderId: number, write: CoderWrite): Promise<void> {
    const updated = await this.sql.query("UPDATE coders SET variables = $1, assignments = $2, ended = $3 WHERE job_id = $4 AND id = $5 RETURNING id", [
      JSON.stringify(write.variables),
      JSON.stringify(write.assignments),
      write.ended === null ? null : JSON.stringify(write.ended),
      this.jobId,
      coderId,
    ]);
    if (updated.length === 0) throw new HttpError(404, "Coder not found");
  }

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    return request.loops.length === 0 ? [] : listFinished(this.sql, this.jobId, request);
  }

  async listAnnotations(coderId: number): Promise<CoderAnnotation[]> {
    const rows = await this.sql.query<{ unitId: number; coderId: number; variable: string; value: VariableValue; created: Date; updated: Date }>(
      `SELECT unit_id AS "unitId", coder_id AS "coderId", variable, value, created, updated FROM annotation_values
       WHERE job_id = $1 AND coder_id = $2 AND retired_at IS NULL ORDER BY created, id`,
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
   * on update. Also marks the unit immutable.
   */
  async putAnnotation(write: AnnotationWrite): Promise<void> {
    const { jobId } = this;
    await this.sql.transaction(async (tx) => {
      const unit = await one<UnitRow>(tx, "SELECT * FROM units WHERE job_id = $1 AND id = $2", [jobId, write.unitId]);
      if (!unit) throw new HttpError(404, "Unit not found");
      // Record what the coder was shown only if it isn't the current content.
      const stale = write.unitHash !== undefined && write.unitHash !== unitHash(unit.external_id, unit.data);
      for (const [variable, value] of Object.entries(write.variables)) {
        await tx.query(
          `INSERT INTO annotation_values (job_id, unit_id, coder_id, variable, value, codebook_id, unit_hash, created, updated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
           ON CONFLICT (unit_id, coder_id, variable) WHERE retired_at IS NULL
           DO UPDATE SET value = excluded.value, codebook_id = excluded.codebook_id, unit_hash = excluded.unit_hash,
             updated = excluded.updated`,
          [jobId, write.unitId, write.coderId, variable, JSON.stringify(value), write.codebookId ?? null, stale ? write.unitHash : null],
        );
      }
      if (!unit.immutable) await tx.query("UPDATE units SET immutable = true WHERE id = $1", [write.unitId]);
    });
  }
}

async function findOrCreateCoder(sql: Sql, jobId: number, request: ResolveCoderRequest): Promise<CoderRow> {
  const known = await one<CoderRow>(sql, "SELECT * FROM coders WHERE coder_key = $1", [request.coderKey]);
  if (known) {
    if (known.job_id !== jobId) throw new HttpError(401, "Coder key belongs to a different job");
    return known;
  }
  if (!request.inviteSecret) throw new HttpError(401, "Unknown coder; a valid invite is needed");
  const invite = await one<InviteRow>(sql, "SELECT * FROM invites WHERE secret = $1", [request.inviteSecret]);
  if (!invite || invite.job_id !== jobId) throw new HttpError(401, "Invalid invite secret");
  if (invite.auth === "required") throw new HttpError(401, "This invite requires login", "auth_required");
  // A participant id is a label, never a credential: a new key for a known
  // participant gets a *new* session, and only when asked for.
  const participantId = invite.participant_id ?? (invite.participant_from_url ? request.participantId : undefined) ?? null;
  const knownParticipant =
    participantId !== null && !!(await one(sql, "SELECT 1 FROM coders WHERE job_id = $1 AND participant_id = $2", [jobId, participantId]));
  if (knownParticipant && !request.newSession) {
    throw new HttpError(409, "This participant already has a session on another device", "participant_has_session");
  }
  // A new session of a known participant is the same person: it doesn't use up the invite.
  if (!knownParticipant) {
    if (invite.revoked_at !== null) throw new HttpError(401, "This invite has been revoked");
    // Checked and counted in one statement, so concurrent coders can't overrun `max_uses`.
    const used = await sql.query("UPDATE invites SET uses = uses + 1 WHERE id = $1 AND (max_uses IS NULL OR uses < max_uses) RETURNING id", [
      invite.id,
    ]);
    if (used.length === 0) throw new HttpError(401, "This invite has been used up");
  }
  // The invite's presets become the coder's values for the codebook's `auto`
  // variables with source "invite".
  const variables = Object.fromEntries(Object.entries(invite.variables).map(([name, value]) => [name, { done: true, skip: false, values: [{ value }] }]));
  const created = await one<CoderRow>(
    sql,
    "INSERT INTO coders (job_id, coder_key, participant_id, variables, invite_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [jobId, request.coderKey, participantId, JSON.stringify(variables), invite.id],
  );
  return created!;
}
