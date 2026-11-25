import type { DeviceDetails } from "../shared/devices.js";
import { type DeletionRequest, type DisplayEntry, type SessionEnd, type VariableValue } from "@annotinder/contracts";
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
  /** Units by id, as deployed: their current versions (`live`; else the drafts, for previews). Unknown ids are left out. */
  getUnits(ids: number[], live: boolean): Promise<Unit[]>;
  /** All coders (for researcher status). */
  listCoders(): Promise<Coder[]>;
  /** The coder for a coder key, created from a link on first use (docs/coder-identity.md). */
  resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder>;
  /** Adds a device to a session (a transfer link): its key now finds this coder. Returns the device's row. */
  addDevice(sessionId: number, coderKey: string, device: DeviceDetails): Promise<number | null>;
  /** Marks that the coder reached a loop (`CoderAssignments`, by loop key), next to the others. */
  routeCoder(sessionId: number, loop: string, assignment: CoderAssignments[string]): Promise<void>;
  /**
   * Adds a value to the coder's session values (a random condition that
   * selects units, once assigned), unless it has one already: returns the
   * value it has. A session value never changes, so its units don't either.
   */
  setSessionValue(sessionId: number, name: string, value: string): Promise<string>;
  /** Stores how the session ended (null: reopened). */
  setEnded(sessionId: number, ended: SessionEnd | null): Promise<void>;
  /** Stores how many units the coder has in the loops they reached (`Coder.knownUnits`). */
  setKnownUnits(sessionId: number, count: number): Promise<void>;
  /** A "continue on another device" link (only its hash is stored). */
  createTransfer(tokenHash: string, transfer: Transfer): Promise<void>;
  /** Uses up a transfer link: what it was for, if it exists and hasn't expired. */
  redeemTransfer(tokenHash: string, now: Date): Promise<Transfer | null>;
  /** Writes coder-level values (answers outside unit loops, assigned values): answer rows without a unit. Assigned and frozen ones stay. */
  putCoderValues(write: CoderValuesWrite): Promise<void>;
  /** The coder's live coder-level answers, by variable. */
  coderValues(sessionId: number): Promise<Record<string, CoderValue>>;
  /** Freezes these coder-level answers of the coder (`CoderValue.frozen`). */
  freezeCoderValues(sessionId: number, names: string[]): Promise<void>;
  /** Records the coder's request to delete their answers (a new request replaces a postponed one). */
  requestDeletion(sessionId: number, request: DeletionRequest): Promise<void>;
  /** Records how the coder's screen looks now, if it changed (at most MAX_DISPLAY_CHANGES). */
  recordDisplay(sessionId: number, entry: DisplayEntry): Promise<void>;
  listFinished(request: FinishedRequest): Promise<Finished[]>;
  /** One coder's live answers for one unit, by variable (empty if none). */
  unitAnswers(sessionId: number, unitId: number): Promise<Record<string, VariableValue>>;
  /** Writes one unit's answers, and the codings they finish (`AnnotationWrite.codings`), together. */
  putAnnotation(write: AnnotationWrite): Promise<void>;
  /** Finished codings, oldest first: in a loop, of a coder, or both. */
  listCodings(filter: { loop?: string; sessionId?: number }): Promise<Coding[]>;
  /** What the stored codings were derived under (the design's loops and the annotation epoch), if anything. */
  codingsBasis(): Promise<string | null>;
  /** Replaces all codings of the study, derived under `basis`. */
  replaceCodings(basis: string, codings: Coding[]): Promise<void>;
  /** The leases of a loop (all coders'), or one coder's (all loops). Also expired ones. */
  listLeases(filter: { loop?: string; sessionId?: number }): Promise<Lease[]>;
  /**
   * Stores leases (a coder holds up to a batch per queue), or renews them.
   * Abandoned ones go: those of ended sessions, and those that expired more
   * than a day before `now` (until then an expired lease still lets its
   * coder submit the unit).
   */
  putLeases(leases: Lease[], now: Date): Promise<void>;
  /**
   * Per coder who has a value for `variables[0]` (a random condition): their
   * values of `variables`, and their session values (for a stratified
   * `balanced` assignment).
   */
  coderValuesOf(
    variables: string[],
  ): Promise<{ values: Record<string, VariableValue>; session: Record<string, string> }[]>;
  /**
   * Runs `fn` in one transaction holding a lock on `key` (in this study), with
   * a store that works in that transaction. For decisions that count other
   * coders: picking from a shared queue, a balanced draw. The
   * lock is a database lock, so it holds across server processes. `long`:
   * work that is long by nature (rederiving a study's codings), which the
   * database's time limits don't end.
   */
  locked<T>(key: string, fn: (store: Store) => Promise<T>, options?: { long?: boolean }): Promise<T>;
  /**
   * Records that a unit was handed to the coder, in this version: when it
   * first was (the server's bound on their time: docs/coder-identity.md
   * §10), and the version last shown (stored with their answers).
   */
  recordServe(sessionId: number, unitId: number, unitVersionId: number): Promise<void>;
  /** The unit version last shown to the coder (`recordServe`), if any. */
  servedVersion(sessionId: number, unitId: number): Promise<number | null>;
  /** Refuses answers that are too large, or that would take the study past its limit on answers (shared/limits.ts). */
  checkAnswers(variables: Record<string, VariableValue>): Promise<void>;
}

/** A lease that expired before this is abandoned (`Store.putLeases`): a day before `now`. */
export const abandonedBefore = (now: Date) => new Date(now.getTime() - 24 * 60 * 60_000);
