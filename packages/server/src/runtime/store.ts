import type { DeviceDetails } from "../shared/devices.js";
import { inviteOf, type DeletionRequest, type SessionEnd, type VariableValue } from "@annotinder/contracts";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql, type AnyColumn } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  annotationValues,
  coderDevices,
  coders,
  deployments,
  links,
  studies,
  transfers,
  unitCodings,
  unitLeases,
  units,
  unitServes,
  unitVersions,
} from "../db/schema/index.js";
import { coderAnswers, putCoderValues, toCoder, type CoderRow } from "../shared/coders.js";
import { getDeploymentSpec, getPreviewSpec } from "../shared/deployments.js";
import { listFinished } from "../shared/finished.js";
import { HttpError } from "../shared/http.js";
import { emailCoders, sessionValues } from "./sessionValues.js";
import { getSettings } from "../shared/accounts.js";
import { checkAnswerSize, checkNewCoder, studyLimits } from "../shared/limits.js";
import { lockUnits, servedUnits } from "../shared/units.js";
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
 * What the runtime reads from and writes to the database, for one study: the
 * database (DbStore), or a preview's in-memory stand-in (preview.ts). Async,
 * like any database driver.
 */
export interface Store {
  getDeployment(): Promise<DeploymentSpec>;
  /**
   * What tells whether the deployment changed since it was read: its
   * version, annotation epoch and revision (`deployments.revision`), and
   * whether the study is suspended. Read on every request, so every server
   * process sees a change at once. Null: no cheap check (previews), read
   * the deployment itself.
   */
  deploymentStamp(): Promise<string | null>;
  /** Unit content by id; unknown ids are left out. */
  /** Units as deployed: their current versions (`live`; else the drafts, for previews). */
  getUnits(ids: number[], live: boolean): Promise<Unit[]>;
  /** All coders (for researcher status). */
  listCoders(): Promise<Coder[]>;
  /** The coder for a coder key, created from a link on first use (docs/coder-identity.md). */
  resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder>;
  /** Adds a device to a session (a transfer link): its key now finds this coder. Returns the device's row. */
  addDevice(coderId: number, coderKey: string, device: DeviceDetails): Promise<number | null>;
  /** Marks that the coder reached a loop (`CoderAssignments`, by loop key), next to the others. */
  routeCoder(coderId: number, loop: string, assignment: CoderAssignments[string]): Promise<void>;
  /**
   * Adds a value to the coder's session values (a random condition that
   * selects units, once assigned), unless it has one already: returns the
   * value it has. A session value never changes, so its units don't either.
   */
  setSessionValue(coderId: number, name: string, value: string): Promise<string>;
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
  /** Replaces all codings of the study, derived under `basis`. */
  replaceCodings(basis: string, codings: Coding[]): Promise<void>;
  /** The leases of a loop (all coders'), or one coder's (all loops). Also expired ones. */
  listLeases(filter: { loop?: string; coderId?: number }): Promise<Lease[]>;
  /** Stores leases (a coder holds up to a batch per queue), or renews them. */
  putLeases(leases: Lease[]): Promise<void>;
  /**
   * Per coder who has a value for `variables[0]` (an `auto` question): their
   * values of `variables`, and their session values (for a stratified
   * `balanced` assignment).
   */
  coderValuesOf(
    variables: string[],
  ): Promise<{ values: Record<string, VariableValue>; session: Record<string, string> }[]>;
  /**
   * Runs `fn` in one transaction holding a lock on `key` (in this study), with
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
  /** Refuses answers that are too large, or that would take the study past its limit on answers (shared/limits.ts). */
  checkAnswers(variables: Record<string, VariableValue>): Promise<void>;
}

/** A study's data in the database. */
export class DbStore implements Store {
  constructor(
    private db: Db,
    private studyId: number,
    /** Use the latest codebook instead of the deployed one (previews). */
    private preview = false,
  ) {}

  /** This study's coder (by id). */
  private coder(coderId: number) {
    return and(eq(coders.studyId, this.studyId), eq(coders.id, coderId));
  }

  async deploymentStamp(): Promise<string | null> {
    if (this.preview) return null;
    const [found] = await this.db
      .select({
        stamp: sql<string>`concat_ws('/', ${deployments.version}, ${deployments.annotationEpoch}, ${deployments.revision}, ${studies.suspendedAt} IS NOT NULL)`,
      })
      .from(studies)
      .leftJoin(deployments, eq(deployments.studyId, studies.id))
      .where(eq(studies.id, this.studyId));
    return found?.stamp ?? "";
  }

  async getDeployment(): Promise<DeploymentSpec> {
    if ((await this.db.$count(studies, and(eq(studies.id, this.studyId), isNotNull(studies.suspendedAt)))) > 0) {
      throw new HttpError(403, "This study isn't available", "study_suspended");
    }
    const spec = this.preview
      ? await getPreviewSpec(this.db, this.studyId)
      : await getDeploymentSpec(this.db, this.studyId);
    if (!spec) throw new HttpError(404, this.preview ? "Study has no design yet" : "Study is not deployed");
    return spec;
  }

  /** Units as deployed (their current versions; a preview: the drafts). */
  async getUnits(ids: number[], live: boolean): Promise<Unit[]> {
    if (ids.length === 0) return [];
    return servedUnits(this.db, this.studyId, live, ids);
  }

  async listCoders(): Promise<Coder[]> {
    return (await this.db.select().from(coders).where(eq(coders.studyId, this.studyId)).orderBy(asc(coders.id))).map(
      toCoder,
    );
  }

  async resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    // The common case, a device that has a session here: one query.
    const known = request.newSession ? null : await knownCoder(this.db, this.studyId, request.coderKey);
    const linkable = !!known && request.linkable && known.coder.email === null;
    if (known && !linkable) return { coder: toCoder(known.coder), deviceId: known.deviceId };
    // The login only where it matters (read before the transaction: it is another query).
    const login = (await request.login?.()) ?? null;
    if (known && !login) return { coder: toCoder(known.coder), deviceId: known.deviceId };
    const { row: coder, deviceId } = await this.db.transaction((tx) =>
      findOrCreateCoder(tx, this.studyId, request, known, login),
    );
    return { coder: toCoder(coder), deviceId };
  }

  coderValues(coderId: number): Promise<Record<string, CoderValue>> {
    return coderAnswers(this.db, this.studyId, coderId);
  }

  async freezeCoderValues(coderId: number, names: string[]): Promise<void> {
    if (names.length === 0) return;
    const a = annotationValues;
    await this.db
      .update(a)
      .set({ frozen: true })
      .where(
        and(
          eq(a.studyId, this.studyId),
          eq(a.coderId, coderId),
          isNull(a.unitId),
          isNull(a.retiredAt),
          eq(a.frozen, false),
          inArray(a.variable, names),
        ),
      );
  }

  async putCoderValues(write: CoderValuesWrite): Promise<void> {
    await this.db.transaction((tx) => putCoderValues(tx, this.studyId, write));
  }

  async addDevice(coderId: number, coderKey: string, device: DeviceDetails): Promise<number | null> {
    return addDevice(this.db, this.studyId, coderId, coderKey, device);
  }

  /** The answer size and the study's answer limit, and its answers so far: read again at most once a minute. */
  private answerRules: { at: number; answerBytes: number; max: number | null; count: number } | null = null;

  async checkAnswers(variables: Record<string, VariableValue>): Promise<void> {
    const now = Date.now();
    if (!this.answerRules || now - this.answerRules.at > 60_000) {
      const { answerBytes } = await getSettings(this.db);
      const { limits } = await studyLimits(this.db, this.studyId);
      const max = limits.answersPerStudy ?? null;
      const count =
        max === null ? 0 : await this.db.$count(annotationValues, eq(annotationValues.studyId, this.studyId));
      this.answerRules = { at: now, answerBytes, max, count };
    }
    const rules = this.answerRules;
    for (const [name, value] of Object.entries(variables)) checkAnswerSize(name, value, rules.answerBytes);
    const added = Object.keys(variables).length;
    // Counts rewritten answers too, until the next read: a little early at worst.
    if (rules.max !== null && rules.count + added > rules.max) {
      throw new HttpError(403, "This study has reached its limit on answers", "study_full");
    }
    rules.count += added;
  }

  async routeCoder(coderId: number, loop: string, assignment: CoderAssignments[string]): Promise<void> {
    // Merged into the stored marks, so two loops at once don't overwrite each other.
    const updated = await this.db
      .update(coders)
      .set({
        assignments: sql`coalesce(${coders.assignments}, '{}'::jsonb) || jsonb_build_object(${loop}::text, ${JSON.stringify(assignment)}::jsonb)`,
      })
      .where(this.coder(coderId))
      .returning({ id: coders.id });
    if (updated.length === 0) throw new HttpError(404, "Coder not found");
  }

  async setSessionValue(coderId: number, name: string, value: string): Promise<string> {
    // Set once: a value already there stays
    const [updated] = await this.db
      .update(coders)
      .set({
        session: sql`CASE WHEN ${coders.session} ? ${name}::text THEN ${coders.session} ELSE ${coders.session} || jsonb_build_object(${name}::text, ${value}::text) END`,
      })
      .where(this.coder(coderId))
      .returning({ value: sql<string>`${coders.session}->>${name}::text` });
    return updated?.value ?? value;
  }

  async setEnded(coderId: number, ended: SessionEnd | null): Promise<void> {
    const updated = await this.db.update(coders).set({ ended }).where(this.coder(coderId)).returning({ id: coders.id });
    if (updated.length === 0) throw new HttpError(404, "Coder not found");
  }

  async createTransfer(tokenHash: string, transfer: Transfer): Promise<void> {
    await this.db.delete(transfers).where(lt(transfers.expires, sql`now()`));
    await this.db.insert(transfers).values({ tokenHash, studyId: this.studyId, ...transfer });
  }

  async redeemTransfer(tokenHash: string, now: Date): Promise<Transfer | null> {
    const [redeemed] = await this.db
      .delete(transfers)
      .where(and(eq(transfers.tokenHash, tokenHash), eq(transfers.studyId, this.studyId)))
      .returning({ coderId: transfers.coderId, participant: transfers.participant, expires: transfers.expires });
    if (!redeemed || redeemed.expires <= now) return null;
    return redeemed;
  }

  async requestDeletion(coderId: number, request: DeletionRequest): Promise<void> {
    await this.db.update(coders).set({ deletionRequest: request }).where(this.coder(coderId));
  }

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    return request.loops.length === 0 ? [] : listFinished(this.db, this.studyId, request);
  }

  async unitAnswers(coderId: number, unitId: number): Promise<Record<string, VariableValue>> {
    const a = annotationValues;
    const found = await this.db
      .select({ variable: a.variable, value: a.value })
      .from(a)
      .where(and(eq(a.studyId, this.studyId), eq(a.coderId, coderId), eq(a.unitId, unitId), isNull(a.retiredAt)));
    return Object.fromEntries(found.map((r) => [r.variable, r.value]));
  }

  async listCodings(filter: { loop?: string; coderId?: number }): Promise<Coding[]> {
    // Times as epoch ms: a shared queue reads every coding of the loop for each pick, and parsing timestamps dominated.
    const epochMs = (column: AnyColumn) => sql<number>`(extract(epoch FROM ${column}) * 1000)::float8`;
    const found = await this.db
      .select({
        loop: unitCodings.loopKey,
        unitId: unitCodings.unitId,
        coderId: unitCodings.coderId,
        agreement: unitCodings.agreement,
        created: epochMs(unitCodings.created),
        updated: epochMs(unitCodings.updated),
      })
      .from(unitCodings)
      .where(
        and(
          eq(unitCodings.studyId, this.studyId),
          filter.loop === undefined ? undefined : eq(unitCodings.loopKey, filter.loop),
          filter.coderId === undefined ? undefined : eq(unitCodings.coderId, filter.coderId),
        ),
      )
      .orderBy(asc(unitCodings.created), asc(unitCodings.unitId));
    return found.map((r) => ({ ...r, created: new Date(r.created), updated: new Date(r.updated) }));
  }

  async codingsBasis(): Promise<string | null> {
    if (this.preview) return null;
    const [deployment] = await this.db
      .select({ basis: deployments.codingsBasis })
      .from(deployments)
      .where(eq(deployments.studyId, this.studyId));
    return deployment?.basis ?? null;
  }

  async replaceCodings(basis: string, codings: Coding[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(unitCodings).where(eq(unitCodings.studyId, this.studyId));
      for (const c of codings) await insertCoding(tx, this.studyId, c);
      await tx.update(deployments).set({ codingsBasis: basis }).where(eq(deployments.studyId, this.studyId));
    });
  }

  async listLeases(filter: { loop?: string; coderId?: number }): Promise<Lease[]> {
    return this.db
      .select({
        loop: unitLeases.loopKey,
        set: unitLeases.setName,
        coderId: unitLeases.coderId,
        unitId: unitLeases.unitId,
        expires: unitLeases.expires,
      })
      .from(unitLeases)
      .where(
        and(
          eq(unitLeases.studyId, this.studyId),
          filter.loop === undefined ? undefined : eq(unitLeases.loopKey, filter.loop),
          filter.coderId === undefined ? undefined : eq(unitLeases.coderId, filter.coderId),
        ),
      );
  }

  async putLeases(leases: Lease[]): Promise<void> {
    if (leases.length === 0) return;
    await this.db
      .insert(unitLeases)
      .values(
        leases.map((l) => ({
          studyId: this.studyId,
          loopKey: l.loop,
          setName: l.set,
          coderId: l.coderId,
          unitId: l.unitId,
          expires: l.expires,
        })),
      )
      .onConflictDoUpdate({
        target: [unitLeases.studyId, unitLeases.loopKey, unitLeases.setName, unitLeases.coderId, unitLeases.unitId],
        set: { expires: sql`excluded.expires` },
      });
  }

  async coderValuesOf(
    variables: string[],
  ): Promise<{ values: Record<string, VariableValue>; session: Record<string, string> }[]> {
    const a = annotationValues;
    /** A coder's live coder-level answer to `variable`. */
    const coderLevel = (variable: string | string[]) =>
      and(
        eq(a.studyId, this.studyId),
        isNull(a.unitId),
        isNull(a.retiredAt),
        Array.isArray(variable) ? inArray(a.variable, variable) : eq(a.variable, variable),
      );
    // The coders who answered the first variable, with their answers to all of them
    const answeredFirst = this.db.select({ coderId: a.coderId }).from(a).where(coderLevel(variables[0]!));
    const found = await this.db
      .select({
        coderId: a.coderId,
        variable: a.variable,
        value: a.value,
        session: coders.session,
        participant: coders.participantId,
      })
      .from(a)
      .innerJoin(coders, eq(coders.id, a.coderId))
      .where(and(coderLevel(variables), inArray(a.coderId, answeredFirst)));
    const byCoder = new Map<number, { values: Record<string, VariableValue>; session: Record<string, string> }>();
    for (const r of found) {
      if (!byCoder.has(r.coderId))
        byCoder.set(r.coderId, {
          values: {},
          session: { ...r.session, ...(r.participant ? { participant: r.participant } : {}) },
        });
      byCoder.get(r.coderId)!.values[r.variable] = r.value;
    }
    return [...byCoder.values()];
  }

  locked<T>(key: string, fn: (store: Store) => Promise<T>): Promise<T> {
    const lock = `${this.studyId}/${key}`;
    // In this process, one at a time before taking a connection: requests
    // waiting for the database lock would otherwise hold the whole pool.
    return inTurn(this.db, lock, () =>
      this.db.transaction(async (tx) => {
        await advisoryLock(tx, lock);
        return fn(new DbStore(tx, this.studyId, this.preview));
      }),
    );
  }

  /**
   * Upserts a live value per given variable; variables not given are left
   * alone (so values from older design versions stay). `created` is kept
   * on update. Also marks the unit coded.
   */
  async putAnnotation(write: AnnotationWrite): Promise<void> {
    const { studyId } = this;
    const a = annotationValues;
    await this.db.transaction(async (tx) => {
      const [unit] = await tx
        .select({ coded: units.coded })
        .from(units)
        .where(and(eq(units.studyId, studyId), eq(units.id, write.unitId)));
      if (!unit) throw new HttpError(404, "Unit not found");
      // No deploy deletes versions meanwhile
      await lockUnits(tx, studyId, "read");
      // The version the coder saw; one a deploy just deleted (nobody had answered on it) gives way to the current one.
      const [version] = await tx
        .select({ id: unitVersions.id })
        .from(unitVersions)
        .where(
          or(
            write.unitVersionId == null ? undefined : eq(unitVersions.id, write.unitVersionId),
            and(eq(unitVersions.unitId, write.unitId), isNull(unitVersions.toDeploy)),
          ),
        )
        .orderBy(sql`${unitVersions.id} = ${write.unitVersionId ?? null}::int DESC NULLS LAST`)
        .limit(1);
      for (const [variable, value] of Object.entries(write.variables)) {
        await tx
          .insert(a)
          .values({
            studyId,
            unitId: write.unitId,
            coderId: write.coderId,
            variable,
            value,
            designVersionId: write.designVersionId ?? null,
            unitVersionId: version?.id ?? null,
            deviceId: write.deviceId ?? null,
            timing: write.timings?.[variable] ?? null,
            created: sql`now()`,
            updated: sql`now()`,
          })
          .onConflictDoUpdate({
            // The live answer (the partial unique index annotation_values_live)
            target: [a.unitId, a.coderId, a.variable],
            targetWhere: isNull(a.retiredAt),
            set: {
              value: sql`excluded.value`,
              designVersionId: sql`excluded.design_version_id`,
              unitVersionId: sql`excluded.unit_version_id`,
              deviceId: sql`excluded.device_id`,
              timing: sql`excluded.timing`,
              updated: sql`excluded.updated`,
            },
          });
      }
      for (const coding of write.codings ?? []) {
        const now = new Date();
        await insertCoding(tx, studyId, {
          loop: coding.loop,
          unitId: write.unitId,
          coderId: write.coderId,
          agreement: coding.agreement,
          created: now,
          updated: now,
        });
        // Finished: the coder's lease on it has done its study (distribution ignores it from now on anyway).
        await tx
          .delete(unitLeases)
          .where(
            and(
              eq(unitLeases.studyId, studyId),
              eq(unitLeases.loopKey, coding.loop),
              eq(unitLeases.coderId, write.coderId),
              eq(unitLeases.unitId, write.unitId),
            ),
          );
      }
      if (!unit.coded) await tx.update(units).set({ coded: true }).where(eq(units.id, write.unitId));
    });
  }

  async recordServe(coderId: number, unitId: number, unitVersionId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      // No deploy deletes the version meanwhile; one deleted just before: none recorded
      await lockUnits(tx, this.studyId, "read");
      const [version] = await tx
        .select({ id: unitVersions.id })
        .from(unitVersions)
        .where(eq(unitVersions.id, unitVersionId));
      await tx
        .insert(unitServes)
        .values({ studyId: this.studyId, coderId, unitId, unitVersionId: version?.id ?? null })
        .onConflictDoUpdate({
          target: [unitServes.coderId, unitServes.unitId],
          set: { unitVersionId: sql`excluded.unit_version_id` },
          setWhere: sql`${unitServes.unitVersionId} IS DISTINCT FROM excluded.unit_version_id`,
        });
    });
  }

  async servedVersion(coderId: number, unitId: number): Promise<number | null> {
    const [served] = await this.db
      .select({ versionId: unitServes.unitVersionId })
      .from(unitServes)
      .where(and(eq(unitServes.coderId, coderId), eq(unitServes.unitId, unitId)));
    return served?.versionId ?? null;
  }
}

/** Waits for a database lock on `key`, held until the transaction ends. */
async function advisoryLock(tx: Db, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}

/** Adds a device's key to a session (or moves it there from another one); returns the device row. */
async function addDevice(
  db: Db,
  studyId: number,
  coderId: number,
  coderKey: string,
  device: DeviceDetails = { type: null, browser: null, os: null },
): Promise<number> {
  const [added] = await db
    .insert(coderDevices)
    .values({ studyId, coderId, keyHash: coderKey, deviceType: device.type, browser: device.browser, os: device.os })
    .onConflictDoUpdate({ target: coderDevices.keyHash, set: { coderId: sql`excluded.coder_id` } })
    .returning({ id: coderDevices.id });
  return added!.id;
}

/** The latest session in this study linked to an email (one per email: docs/coder-identity.md §5). */
async function sessionOfEmail(db: Db, studyId: number, email: string): Promise<CoderRow | undefined> {
  const [found] = await db
    .select()
    .from(coders)
    .where(and(eq(coders.studyId, studyId), sql`lower(${coders.email}) = lower(${email})`))
    .orderBy(sql`${coders.id} DESC`)
    .limit(1);
  return found;
}

/** Stores a finished coding; one finished again keeps its first time and gets the new agreement answers. */
async function insertCoding(db: Db, studyId: number, c: Coding): Promise<void> {
  await db
    .insert(unitCodings)
    .values({
      studyId,
      loopKey: c.loop,
      unitId: c.unitId,
      coderId: c.coderId,
      agreement: c.agreement,
      created: c.created,
      updated: c.updated,
    })
    .onConflictDoUpdate({
      target: [unitCodings.studyId, unitCodings.loopKey, unitCodings.unitId, unitCodings.coderId],
      set: { agreement: sql`excluded.agreement`, updated: sql`excluded.updated` },
    });
}

/** A device's session: the coder and the device row. */
interface KnownCoder {
  coder: CoderRow;
  deviceId: number;
}

/** The session a device key has in this study, if any. */
async function knownCoder(db: Db, studyId: number, coderKey: string): Promise<KnownCoder | null> {
  const [known] = await db
    .select({ coder: coders, deviceId: coderDevices.id })
    .from(coderDevices)
    .innerJoin(coders, eq(coders.id, coderDevices.coderId))
    .where(eq(coderDevices.keyHash, coderKey));
  if (known && known.coder.studyId !== studyId)
    throw new HttpError(403, "This session belongs to another study", "coder_key_invalid");
  return known ?? null;
}

/**
 * A device's session to link to a login (`known`, without an email yet), or
 * a new device's: found by the login, or created from the link.
 */
async function findOrCreateCoder(
  db: Db,
  studyId: number,
  request: ResolveCoderRequest,
  known: KnownCoder | null,
  login: { email: string } | null,
): Promise<{ row: CoderRow; deviceId: number }> {
  const { coderKey, device } = request;
  if (known && login) {
    // A login links its email to the session, once. If the email already
    // has a session in this study, this device continues that one instead.
    const other = await sessionOfEmail(db, studyId, login.email);
    if (other) return { row: other, deviceId: await addDevice(db, studyId, other.id, coderKey, device) };
    const [linked] = await db
      .update(coders)
      .set({ email: login.email.toLowerCase() })
      .where(eq(coders.id, known.coder.id))
      .returning();
    return { row: linked!, deviceId: known.deviceId };
  }
  // A new device of a linked session: logging in finds it. Email coders have one session each: a new one
  // isn't made for them (their units are their email's), also when asked for.
  if (login && (!request.newSession || (request.sessionRules && emailCoders(request.sessionRules)))) {
    const mine = await sessionOfEmail(db, studyId, login.email);
    if (mine) return { row: mine, deviceId: await addDevice(db, studyId, mine.id, coderKey, device) };
  }
  // Link problems: 404 (no such link) or 403 (no new sessions), never 401, which only means "log in" (auth_required)
  if (!request.linkSecret) throw new HttpError(404, "No session here: open the link you were given", "link_not_found");
  const [link] = await db.select().from(links).where(eq(links.secret, request.linkSecret));
  if (!link || link.studyId !== studyId) throw new HttpError(404, "This link doesn't exist", "link_not_found");
  // Revoked or retired: no new sessions, also not for a known participant (existing sessions go on).
  if (link.revokedAt !== null) throw new HttpError(403, "This link has been revoked", "link_revoked");
  if (link.retiredAt !== null) throw new HttpError(403, "This link is no longer active", "link_inactive");
  // A participant id is a label, never a credential: a new device for a
  // known participant gets a *new* session, and only when asked for.
  const { participantId, session } = sessionValues(
    request.sessionRules ?? { item: null, setsOf: () => [] },
    { params: link.params, participantId: link.participantId },
    request.urlParams ?? {},
    login?.email ?? null,
  );
  const knownParticipant =
    participantId !== null &&
    (await db.$count(coders, and(eq(coders.studyId, studyId), eq(coders.participantId, participantId)))) > 0;
  if (knownParticipant && !request.newSession) {
    throw new HttpError(409, "This participant already has a session on another device", "participant_has_session");
  }
  if (request.paused) throw new HttpError(409, "This study is paused", "study_paused");
  await checkNewCoder(db, studyId);
  // A new session of a known participant is the same person: it doesn't use up the link.
  if (!knownParticipant) {
    // Checked and counted in one statement, so concurrent coders can't overrun `max_uses`.
    // The link's own limit, else a crowd's most coders (docs/architecture.md §5)
    const invite = inviteOf(request.sessionRules?.item);
    const maxCoders = invite.mode === "crowd" ? (invite.maxCoders ?? null) : null;
    const maxUses = sql`COALESCE(${links.maxUses}, ${maxCoders}::int)`;
    const used = await db
      .update(links)
      .set({ uses: sql`${links.uses} + 1` })
      .where(and(eq(links.id, link.id), or(sql`${maxUses} IS NULL`, lt(links.uses, maxUses))))
      .returning({ id: links.id });
    if (used.length === 0) throw new HttpError(403, "This link has been used up", "link_used_up");
  }
  const [created] = await db
    .insert(coders)
    .values({ studyId, email: login?.email.toLowerCase() ?? null, participantId, linkId: link.id, session })
    .returning();
  // A new session on a device that had one (`newSession`): the device moves to the new one.
  return { row: created!, deviceId: await addDevice(db, studyId, created!.id, coderKey, device) };
}

/** Per database and key, the last call in line (`inTurn`). */
const lines = new WeakMap<Db, Map<string, Promise<unknown>>>();

/** Runs `fn` after earlier calls with the same key (on this database, in this process) have finished. */
function inTurn<T>(db: Db, key: string, fn: () => Promise<T>): Promise<T> {
  let byKey = lines.get(db);
  if (!byKey) lines.set(db, (byKey = new Map()));
  const run = (byKey.get(key) ?? Promise.resolve()).then(fn);
  const last = run.catch(() => undefined);
  byKey.set(key, last);
  void last.then(() => {
    if (byKey.get(key) === last) byKey.delete(key);
  });
  return run;
}
