import type { DeviceDetails } from "../shared/devices.js";
import {
  MAX_DISPLAY_CHANGES,
  type DeletionRequest,
  type DisplayEntry,
  type SessionEnd,
  type VariableValue,
} from "@annotinder/contracts";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql, type AnyColumn } from "drizzle-orm";
import { withoutTimeLimits, type Db } from "../db/index.js";
import {
  annotationValues,
  coderSessions,
  deployments,
  studies,
  transfers,
  unitCodings,
  unitLeases,
  unitServes,
  unitVersions,
} from "../db/schema/index.js";
import { coderAnswers, putCoderValues, toCoder } from "../shared/coders.js";
import { getDeploymentSpec, getPreviewSpec } from "../shared/deployments.js";
import { listFinished } from "../shared/finished.js";
import { HttpError } from "../shared/http.js";
import { getSettings } from "../shared/accounts.js";
import { checkAnswerSize, studyLimits } from "../shared/limits.js";
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
import { advisoryLock, inTurn } from "../db/locks.js";
import { insertCodings, putAnnotation } from "../shared/annotations.js";
import { addDevice, findOrCreateCoder, knownCoder } from "./startSession.js";
import { abandonedBefore, type Store } from "./store.js";

/** A study's data in the database. */
export class DbStore implements Store {
  constructor(
    private db: Db,
    private studyId: number,
    /** Use the latest design instead of the deployed one (previews). */
    private preview = false,
  ) {}

  /** This study's session (by id). */
  private sessionWhere(sessionId: number) {
    return and(eq(coderSessions.studyId, this.studyId), eq(coderSessions.id, sessionId));
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
    return (
      await this.db
        .select()
        .from(coderSessions)
        .where(eq(coderSessions.studyId, this.studyId))
        .orderBy(asc(coderSessions.id))
    ).map(toCoder);
  }

  async resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    // The common case, a device that has a session here: one query.
    const known = request.newSession ? null : await knownCoder(this.db, this.studyId, request.coderKey);
    const linkable = !!known && request.linkable && known.coder.email === null;
    if (known && !linkable) return { coder: toCoder(known.coder), deviceId: known.deviceId };
    // The login only where it matters (read before the transaction: it is another query).
    const login = (await request.login?.()) ?? null;
    if (known && !login) return { coder: toCoder(known.coder), deviceId: known.deviceId };
    if (!known) await request.beforeNewSession?.();
    const { row: coder, deviceId } = await this.db.transaction(async (tx) => {
      // One at a time per device: of two first requests at once, the second finds the session the first made
      await advisoryLock(tx, `device:${request.coderKey}`);
      const started = known || request.newSession ? null : await knownCoder(tx, this.studyId, request.coderKey);
      if (started) return { row: started.coder, deviceId: started.deviceId };
      return findOrCreateCoder(tx, this.studyId, request, known, login);
    });
    return { coder: toCoder(coder), deviceId };
  }

  coderValues(sessionId: number): Promise<Record<string, CoderValue>> {
    return coderAnswers(this.db, this.studyId, sessionId);
  }

  async freezeCoderValues(sessionId: number, names: string[]): Promise<void> {
    if (names.length === 0) return;
    const a = annotationValues;
    await this.db
      .update(a)
      .set({ frozen: true })
      .where(
        and(
          eq(a.studyId, this.studyId),
          eq(a.sessionId, sessionId),
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

  async addDevice(sessionId: number, coderKey: string, device: DeviceDetails): Promise<number | null> {
    return addDevice(this.db, this.studyId, sessionId, coderKey, device);
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

  async routeCoder(sessionId: number, loop: string, assignment: CoderAssignments[string]): Promise<void> {
    // Merged into the stored marks, so two loops at once don't overwrite each other.
    const updated = await this.db
      .update(coderSessions)
      .set({
        assignments: sql`coalesce(${coderSessions.assignments}, '{}'::jsonb) || jsonb_build_object(${loop}::text, ${JSON.stringify(assignment)}::jsonb)`,
      })
      .where(this.sessionWhere(sessionId))
      .returning({ id: coderSessions.id });
    if (updated.length === 0) throw new HttpError(404, "Coder not found");
  }

  async setSessionValue(sessionId: number, name: string, value: string): Promise<string> {
    // Set once: a value already there stays
    const [updated] = await this.db
      .update(coderSessions)
      .set({
        session: sql`CASE WHEN ${coderSessions.session} ? ${name}::text THEN ${coderSessions.session} ELSE ${coderSessions.session} || jsonb_build_object(${name}::text, ${value}::text) END`,
      })
      .where(this.sessionWhere(sessionId))
      .returning({ value: sql<string>`${coderSessions.session}->>${name}::text` });
    return updated?.value ?? value;
  }

  async setEnded(sessionId: number, ended: SessionEnd | null): Promise<void> {
    const updated = await this.db
      .update(coderSessions)
      .set({ ended })
      .where(this.sessionWhere(sessionId))
      .returning({ id: coderSessions.id });
    if (updated.length === 0) throw new HttpError(404, "Coder not found");
  }

  async setKnownUnits(sessionId: number, count: number): Promise<void> {
    await this.db.update(coderSessions).set({ knownUnits: count }).where(this.sessionWhere(sessionId));
  }

  async createTransfer(tokenHash: string, transfer: Transfer): Promise<void> {
    await this.db.delete(transfers).where(lt(transfers.expires, sql`now()`));
    await this.db.insert(transfers).values({ tokenHash, studyId: this.studyId, ...transfer });
  }

  async redeemTransfer(tokenHash: string, now: Date): Promise<Transfer | null> {
    const [redeemed] = await this.db
      .delete(transfers)
      .where(and(eq(transfers.tokenHash, tokenHash), eq(transfers.studyId, this.studyId)))
      .returning({ sessionId: transfers.sessionId, coder: transfers.coder, expires: transfers.expires });
    if (!redeemed || redeemed.expires <= now) return null;
    return redeemed;
  }

  async requestDeletion(sessionId: number, request: DeletionRequest): Promise<void> {
    await this.db.update(coderSessions).set({ deletionRequest: request }).where(this.sessionWhere(sessionId));
  }

  async recordDisplay(sessionId: number, entry: DisplayEntry): Promise<void> {
    // Appended when it differs from the last one, while there are fewer than the most
    const change = JSON.stringify({ ...entry, at: new Date().toISOString() });
    await this.db
      .update(coderSessions)
      .set({ display: sql`${coderSessions.display} || jsonb_build_array(${change}::jsonb)` })
      .where(
        and(
          this.sessionWhere(sessionId),
          sql`jsonb_array_length(${coderSessions.display}) < ${MAX_DISPLAY_CHANGES}`,
          sql`(jsonb_array_length(${coderSessions.display}) = 0 OR (${coderSessions.display} -> -1) - 'at' <> ${JSON.stringify(entry)}::jsonb)`,
        ),
      );
  }

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    return request.loops.length === 0 ? [] : listFinished(this.db, this.studyId, request);
  }

  async unitAnswers(sessionId: number, unitId: number): Promise<Record<string, VariableValue>> {
    const a = annotationValues;
    const found = await this.db
      .select({ variable: a.variable, value: a.value })
      .from(a)
      .where(and(eq(a.studyId, this.studyId), eq(a.sessionId, sessionId), eq(a.unitId, unitId), isNull(a.retiredAt)));
    return Object.fromEntries(found.map((r) => [r.variable, r.value]));
  }

  async listCodings(filter: { loop?: string; sessionId?: number }): Promise<Coding[]> {
    // Times as epoch ms: a shared queue reads every coding of the loop for each pick, and parsing timestamps dominated.
    const epochMs = (column: AnyColumn) => sql<number>`(extract(epoch FROM ${column}) * 1000)::float8`;
    const found = await this.db
      .select({
        loop: unitCodings.loopKey,
        unitId: unitCodings.unitId,
        sessionId: unitCodings.sessionId,
        agreement: unitCodings.agreement,
        created: epochMs(unitCodings.created),
        updated: epochMs(unitCodings.updated),
      })
      .from(unitCodings)
      .where(
        and(
          eq(unitCodings.studyId, this.studyId),
          filter.loop === undefined ? undefined : eq(unitCodings.loopKey, filter.loop),
          filter.sessionId === undefined ? undefined : eq(unitCodings.sessionId, filter.sessionId),
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
      await insertCodings(tx, this.studyId, codings);
      await tx.update(deployments).set({ codingsBasis: basis }).where(eq(deployments.studyId, this.studyId));
    });
  }

  async listLeases(filter: { loop?: string; sessionId?: number }): Promise<Lease[]> {
    return this.db
      .select({
        loop: unitLeases.loopKey,
        set: unitLeases.setName,
        sessionId: unitLeases.sessionId,
        unitId: unitLeases.unitId,
        expires: unitLeases.expires,
      })
      .from(unitLeases)
      .where(
        and(
          eq(unitLeases.studyId, this.studyId),
          filter.loop === undefined ? undefined : eq(unitLeases.loopKey, filter.loop),
          filter.sessionId === undefined ? undefined : eq(unitLeases.sessionId, filter.sessionId),
        ),
      );
  }

  async putLeases(leases: Lease[], now: Date): Promise<void> {
    if (leases.length === 0) return;
    const ended = this.db
      .select({ id: coderSessions.id })
      .from(coderSessions)
      .where(and(eq(coderSessions.studyId, this.studyId), isNotNull(coderSessions.ended)));
    await this.db
      .delete(unitLeases)
      .where(
        and(
          eq(unitLeases.studyId, this.studyId),
          or(lt(unitLeases.expires, abandonedBefore(now)), inArray(unitLeases.sessionId, ended)),
        ),
      );
    await this.db
      .insert(unitLeases)
      .values(
        leases.map((l) => ({
          studyId: this.studyId,
          loopKey: l.loop,
          setName: l.set,
          sessionId: l.sessionId,
          unitId: l.unitId,
          expires: l.expires,
        })),
      )
      .onConflictDoUpdate({
        target: [unitLeases.studyId, unitLeases.loopKey, unitLeases.setName, unitLeases.sessionId, unitLeases.unitId],
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
    const answeredFirst = this.db.select({ sessionId: a.sessionId }).from(a).where(coderLevel(variables[0]!));
    const found = await this.db
      .select({
        sessionId: a.sessionId,
        variable: a.variable,
        value: a.value,
        session: coderSessions.session,
      })
      .from(a)
      .innerJoin(coderSessions, eq(coderSessions.id, a.sessionId))
      .where(and(coderLevel(variables), inArray(a.sessionId, answeredFirst)));
    const byCoder = new Map<number, { values: Record<string, VariableValue>; session: Record<string, string> }>();
    for (const r of found) {
      if (!byCoder.has(r.sessionId))
        byCoder.set(r.sessionId, {
          values: {},
          session: r.session,
        });
      byCoder.get(r.sessionId)!.values[r.variable] = r.value;
    }
    return [...byCoder.values()];
  }

  locked<T>(key: string, fn: (store: Store) => Promise<T>, options: { long?: boolean } = {}): Promise<T> {
    const lock = `${this.studyId}/${key}`;
    // In this process, one at a time before taking a connection: requests
    // waiting for the database lock would otherwise hold the whole pool.
    return inTurn(this.db, lock, () =>
      this.db.transaction(async (tx) => {
        if (options.long) await withoutTimeLimits(tx);
        await advisoryLock(tx, lock);
        return fn(new DbStore(tx, this.studyId, this.preview));
      }),
    );
  }

  putAnnotation(write: AnnotationWrite): Promise<void> {
    return putAnnotation(this.db, this.studyId, write);
  }

  async recordServe(sessionId: number, unitId: number, unitVersionId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      // No deploy deletes the version meanwhile; one deleted just before: none recorded
      await lockUnits(tx, this.studyId, "read");
      const [version] = await tx
        .select({ id: unitVersions.id })
        .from(unitVersions)
        .where(eq(unitVersions.id, unitVersionId));
      await tx
        .insert(unitServes)
        .values({ studyId: this.studyId, sessionId, unitId, unitVersionId: version?.id ?? null })
        .onConflictDoUpdate({
          target: [unitServes.sessionId, unitServes.unitId],
          set: { unitVersionId: sql`excluded.unit_version_id` },
          setWhere: sql`${unitServes.unitVersionId} IS DISTINCT FROM excluded.unit_version_id`,
        });
    });
  }

  async servedVersion(sessionId: number, unitId: number): Promise<number | null> {
    const [served] = await this.db
      .select({ versionId: unitServes.unitVersionId })
      .from(unitServes)
      .where(and(eq(unitServes.sessionId, sessionId), eq(unitServes.unitId, unitId)));
    return served?.versionId ?? null;
  }
}
