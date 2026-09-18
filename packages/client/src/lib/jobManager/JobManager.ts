import type { CodebookItem, CoderUnitResponse, SessionResponse, VariableValue } from "@annotinder/contracts";
import type { JobServer } from "../api/httpJobServer";
import { computeLoopSteps, computeTopLevelSteps } from "../codebook/tree";

export type JobManagerPhase = "loading" | "user_variable" | "unit_variable" | "finished" | "error";

export interface JobManagerSnapshot {
  phase: JobManagerPhase;
  /** The user_variable/unit_variable item currently being asked, or null when loading/finished/error. */
  currentItem: CodebookItem | null;
  /** Set only while `phase === "unit_variable"`: the unit the current item belongs to. */
  currentUnit: CoderUnitResponse | null;
  error: string | null;
}

/**
 * Drives a coder through a codebook end-to-end against a `JobServer`
 * (design plan §5/3.2). A deliberately simplified port of the old
 * `JobManager`: no phase-token queues, no normalized annotation dictionary --
 * navigation is derived fresh from the codebook's positional item tree
 * (`codebook/tree.ts`) plus the coder's answers so far, and each answer is
 * posted immediately rather than queued.
 *
 * Supports exactly one *active* unit_loop at a time (does not yet handle
 * multiple sibling loops running concurrently or resuming mid-loop after a
 * disconnect beyond what `/session`'s progress list can reconstruct --
 * that's phase 4+ scope, see design plan §3a).
 */
export class JobManager {
  private items: CodebookItem[] = [];
  /** name -> the "plain" value used for condition evaluation (e.g. a picked code string). */
  private conditionValues: Record<string, unknown> = {};
  private userVariableValues: Record<string, VariableValue> = {};
  private unitVariableValues: Record<string, VariableValue> = {};

  private topSteps: CodebookItem[] = [];
  private topIndex = -1;
  private activeLoop: Extract<CodebookItem, { type: "unit_loop" }> | null = null;
  private currentUnit: CoderUnitResponse | null = null;
  private loopSteps: CodebookItem[] = [];
  private loopIndex = -1;

  private listeners = new Set<() => void>();
  private snapshot: JobManagerSnapshot = { phase: "loading", currentItem: null, currentUnit: null, error: null };

  constructor(private jobServer: JobServer) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): JobManagerSnapshot {
    return this.snapshot;
  }

  private publish(patch: Partial<JobManagerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  async start(): Promise<void> {
    try {
      const session: SessionResponse = await this.jobServer.getSession();
      this.items = session.codebook.items;
      this.topIndex = -1;
      await this.advanceTop();
    } catch (err) {
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Records the coder's answer for the currently-presented item, then advances. */
  async answer(value: VariableValue, conditionValue?: unknown): Promise<void> {
    const item = this.snapshot.currentItem;
    if (!item || (item.type !== "user_variable" && item.type !== "unit_variable")) return;

    this.conditionValues[item.name] = conditionValue;

    try {
      if (this.snapshot.phase === "user_variable") {
        this.userVariableValues[item.name] = value;
        await this.jobServer.postCoderVariables(this.userVariableValues);
        await this.advanceTop();
      } else if (this.snapshot.phase === "unit_variable") {
        this.unitVariableValues[item.name] = value;
        await this.advanceUnit();
      }
    } catch (err) {
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async advanceTop(): Promise<void> {
    this.topSteps = computeTopLevelSteps(this.items, this.conditionValues);
    this.topIndex += 1;
    const next = this.topSteps[this.topIndex];

    if (!next) {
      this.publish({ phase: "finished", currentItem: null, currentUnit: null });
      return;
    }

    if (next.type === "unit_loop") {
      this.activeLoop = next;
      this.currentUnit = null;
      this.loopIndex = -1;
      await this.advanceUnit();
      return;
    }

    this.publish({ phase: "user_variable", currentItem: next, currentUnit: null });
  }

  private async advanceUnit(): Promise<void> {
    if (!this.activeLoop) return;

    if (this.currentUnit) {
      this.loopSteps = computeLoopSteps(this.items, this.activeLoop.position, this.conditionValues);
      this.loopIndex += 1;
      const next = this.loopSteps[this.loopIndex];
      if (next) {
        this.publish({ phase: "unit_variable", currentItem: next, currentUnit: this.currentUnit });
        return;
      }

      // No more steps for this unit: submit it (fully done) and move on.
      const doneValues: Record<string, VariableValue> = {};
      for (const [name, value] of Object.entries(this.unitVariableValues)) doneValues[name] = { ...value, done: true };
      await this.jobServer.postUnitVariables(this.currentUnit.id, doneValues);
      this.unitVariableValues = {};
      this.currentUnit = null;
    }

    const unit = await this.jobServer.getNextUnit(this.activeLoop.unitset);
    if (!unit) {
      // This unit_loop is exhausted; resume the top-level sequence after it.
      this.activeLoop = null;
      await this.advanceTop();
      return;
    }

    this.currentUnit = unit;
    this.unitVariableValues = { ...unit.variables };
    this.loopIndex = -1;
    await this.advanceUnit();
  }
}
