import type { DatabaseSync } from "node:sqlite";
import { placeholders, transaction } from "../db.js";
import { toCoder, type CoderRow } from "../shared/coders.js";
import { getDeploymentSpec, getPreviewSpec } from "../shared/deployments.js";
import { listFinished } from "../shared/finished.js";
import { HttpError } from "../shared/http.js";
import { unitHash } from "../shared/units.js";
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
    private db: DatabaseSync,
    private jobId: number,
    /** Use the latest codebook instead of the deployed one (previews). */
    private preview = false,
  ) {}

  async getDeployment(): Promise<DeploymentSpec> {
    const spec = this.preview ? getPreviewSpec(this.db, this.jobId) : getDeploymentSpec(this.db, this.jobId);
    if (!spec) throw new HttpError(404, this.preview ? "Job has no codebook" : "Job is not deployed");
    return spec;
  }

  async getUnits(ids: number[]): Promise<Unit[]> {
    if (ids.length === 0) return [];
    const rows = this.db
      .prepare(`SELECT id, externalId, data FROM units WHERE jobId = ? AND id IN (${placeholders(ids.length)})`)
      .all(this.jobId, ...ids) as unknown as { id: number; externalId: string; data: string }[];
    return rows.map((r) => ({ id: r.id, externalId: r.externalId, data: JSON.parse(r.data), hash: unitHash(r.externalId, r.data) }));
  }

  async listCoders(): Promise<Coder[]> {
    const rows = this.db.prepare("SELECT * FROM coders WHERE jobId = ? ORDER BY id").all(this.jobId) as unknown as CoderRow[];
    return rows.map(toCoder);
  }

  async resolveCoder(request: ResolveCoderRequest): Promise<Coder> {
    return toCoder(transaction(this.db, () => findOrCreateCoder(this.db, this.jobId, request)));
  }

  async putCoder(coderId: number, write: CoderWrite): Promise<void> {
    const result = this.db
      .prepare("UPDATE coders SET variables = ?, assignments = ? WHERE jobId = ? AND id = ?")
      .run(JSON.stringify(write.variables), JSON.stringify(write.assignments), this.jobId, coderId);
    if (result.changes === 0) throw new HttpError(404, "Coder not found");
  }

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    return request.loops.length === 0 ? [] : listFinished(this.db, this.jobId, request);
  }

  async listAnnotations(coderId: number): Promise<CoderAnnotation[]> {
    const rows = this.db
      .prepare(
        `SELECT unitId, coderId, variable, value, created, updated FROM annotation_values
         WHERE jobId = ? AND coderId = ? AND retiredAt IS NULL ORDER BY created, id`,
      )
      .all(this.jobId, coderId) as unknown as {
      unitId: number;
      coderId: number;
      variable: string;
      value: string;
      created: string;
      updated: string;
    }[];
    const byUnit = new Map<number, CoderAnnotation>();
    for (const row of rows) {
      let annotation = byUnit.get(row.unitId);
      if (!annotation) {
        annotation = { unitId: row.unitId, coderId: row.coderId, variables: {}, created: new Date(row.created), updated: new Date(row.updated) };
        byUnit.set(row.unitId, annotation);
      }
      annotation.variables[row.variable] = JSON.parse(row.value);
      if (new Date(row.updated) > annotation.updated) annotation.updated = new Date(row.updated);
    }
    return [...byUnit.values()];
  }

  /**
   * Upserts a live value per given variable; variables not given are left
   * alone (so values from older codebook versions stay). `created` is kept
   * on update. Also marks the unit immutable.
   */
  async putAnnotation(write: AnnotationWrite): Promise<void> {
    const { db, jobId } = this;
    transaction(db, () => {
      const unit = db.prepare("SELECT externalId, data FROM units WHERE jobId = ? AND id = ?").get(jobId, write.unitId) as
        | { externalId: string; data: string }
        | undefined;
      if (!unit) throw new HttpError(404, "Unit not found");
      // Record what the coder was shown only if it isn't the current content.
      const stale = write.unitHash !== undefined && write.unitHash !== unitHash(unit.externalId, unit.data);
      const now = new Date().toISOString();
      const upsert = db.prepare(
        `INSERT INTO annotation_values (jobId, unitId, coderId, variable, value, codebookId, unitHash, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (unitId, coderId, variable) WHERE retiredAt IS NULL
         DO UPDATE SET value = excluded.value, codebookId = excluded.codebookId, unitHash = excluded.unitHash,
           updated = excluded.updated`,
      );
      for (const [variable, value] of Object.entries(write.variables)) {
        upsert.run(jobId, write.unitId, write.coderId, variable, JSON.stringify(value), write.codebookId ?? null, stale ? write.unitHash! : null, now, now);
      }
      db.prepare("UPDATE units SET immutable = 1 WHERE jobId = ? AND id = ?").run(jobId, write.unitId);
    });
  }
}

interface InviteRow {
  id: number;
  jobId: number;
  auth: string;
  maxUses: number | null;
  uses: number;
  variables: string;
  participantId: string | null;
  participantFromUrl: number;
  revokedAt: string | null;
}

function findOrCreateCoder(db: DatabaseSync, jobId: number, request: ResolveCoderRequest): CoderRow {
  const known = db.prepare("SELECT * FROM coders WHERE coderKey = ?").get(request.coderKey) as unknown as CoderRow | undefined;
  if (known) {
    if (known.jobId !== jobId) throw new HttpError(401, "Coder key belongs to a different job");
    return known;
  }
  if (!request.inviteSecret) throw new HttpError(401, "Unknown coder; a valid invite is needed");
  const invite = db.prepare("SELECT * FROM invites WHERE secret = ?").get(request.inviteSecret) as unknown as InviteRow | undefined;
  if (!invite || invite.jobId !== jobId) throw new HttpError(401, "Invalid invite secret");
  if (invite.auth === "required") throw new HttpError(401, "This invite requires login", "auth_required");
  // A participant id is a label, never a credential: a new key for a known
  // participant gets a *new* session, and only when asked for.
  const participantId = invite.participantId ?? (invite.participantFromUrl ? request.participantId : undefined) ?? null;
  const knownParticipant =
    participantId !== null && !!db.prepare("SELECT 1 FROM coders WHERE jobId = ? AND participantId = ?").get(jobId, participantId);
  if (knownParticipant && !request.newSession) {
    throw new HttpError(409, "This participant already has a session on another device", "participant_has_session");
  }
  // A new session of a known participant is the same person: it doesn't use up the invite.
  if (!knownParticipant) {
    if (invite.revokedAt !== null) throw new HttpError(401, "This invite has been revoked");
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) throw new HttpError(401, "This invite has been used up");
    db.prepare("UPDATE invites SET uses = uses + 1 WHERE id = ?").run(invite.id);
  }
  // The invite's presets become the coder's values for the codebook's `auto`
  // variables with source "invite".
  const presets = JSON.parse(invite.variables) as Record<string, string>;
  const variables = Object.fromEntries(Object.entries(presets).map(([name, code]) => [name, { done: true, skip: false, codes: [{ code }] }]));
  db.prepare("INSERT INTO coders (jobId, coderKey, participantId, variables, inviteId, created) VALUES (?, ?, ?, ?, ?, ?)").run(
    jobId,
    request.coderKey,
    participantId,
    JSON.stringify(variables),
    invite.id,
    new Date().toISOString(),
  );
  return db.prepare("SELECT * FROM coders WHERE coderKey = ?").get(request.coderKey) as unknown as CoderRow;
}
