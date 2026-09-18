import type { CodebookItem, CoderUnitResponse, SessionResponse, UnitLayout, VariableValue } from "@annotinder/contracts";
import type { JobServer } from "../api/httpJobServer";
import { ExpressionCache } from "../codebook/expressionCache";
import { renderTemplate } from "../codebook/renderTemplate";
import { computeLoopSteps, computeTopLevelSteps } from "../codebook/tree";

export type JobManagerPhase = "loading" | "user_variable" | "unit_variable" | "finished" | "error";

export interface JobManagerSnapshot {
  phase: JobManagerPhase;
  /** The user_variable/unit_variable item currently being asked, or null when loading/finished/error. */
  currentItem: CodebookItem | null;
  /** Set only while `phase === "unit_variable"`: the unit the current item belongs to. */
  currentUnit: CoderUnitResponse | null;
  /** Set only while `phase === "unit_variable"`: the active unit_loop's layout, for rendering the unit's fields. */
  currentUnitLayout: Extract<CodebookItem, { type: "unit_loop" }>["layout"] | null;
  /**
   * Set only while `phase === "unit_variable"`: this unit's variable
   * answers submitted so far (including the current step's item, once
   * answered) -- lets a `relation` variable's answer field look up a
   * sibling `span` variable's already-collected spans to relate (design
   * plan §11a/§4.3 relation UI).
   */
  currentUnitVariables: Record<string, VariableValue> | null;
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
  /**
   * Per-session, per-slot memoized QuickJS evaluation (design plan §12),
   * shared by both condition evaluation (`computeTopLevelSteps`/
   * `computeLoopSteps`) and unit-layout template resolution
   * (`resolveUnitLayout`) -- avoids re-running an expression/`{{...}}`
   * block's QuickJS evaluation when none of the values it actually
   * references have changed since the last time it ran.
   */
  private expressionCache = new ExpressionCache();

  private listeners = new Set<() => void>();
  private snapshot: JobManagerSnapshot = {
    phase: "loading",
    currentItem: null,
    currentUnit: null,
    currentUnitLayout: null,
    currentUnitVariables: null,
    error: null,
  };
  /**
   * Whatever async operation most recently failed (design plan §6.3:
   * network failures shouldn't strand a coder mid-unit with no way
   * forward). Re-running the exact same closure is safe because both
   * `start()` and `answer()` only mutate local state AFTER their network
   * call(s) succeed -- a failed attempt leaves `conditionValues`/
   * `userVariableValues`/`unitVariableValues` exactly as they were before
   * the attempt, so retrying is just "try that same call again".
   */
  private lastFailedOperation: (() => Promise<void>) | null = null;

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
    this.lastFailedOperation = () => this.start();
    try {
      const session: SessionResponse = await this.jobServer.getSession();
      this.items = session.codebook.items;
      this.topIndex = -1;
      await this.advanceTop();
      this.lastFailedOperation = null;
    } catch (err) {
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Re-attempts whatever operation last failed (design plan §6.3). No-op if nothing failed. */
  async retry(): Promise<void> {
    const op = this.lastFailedOperation;
    if (!op) return;
    await op();
  }

  /** Records the coder's answer for the currently-presented item, then advances. */
  async answer(value: VariableValue, conditionValue?: unknown): Promise<void> {
    const item = this.snapshot.currentItem;
    if (!item || (item.type !== "user_variable" && item.type !== "unit_variable")) return;

    this.lastFailedOperation = () => this.answer(value, conditionValue);
    this.conditionValues[item.name] = conditionValue;

    try {
      // Branch on the item's own type, not `snapshot.phase`: after a failed
      // attempt the phase is temporarily "error", but `retry()` re-invokes
      // this exact closure and still needs to take the right path.
      if (item.type === "user_variable") {
        this.userVariableValues[item.name] = value;
        await this.jobServer.postCoderVariables(this.userVariableValues);
        await this.advanceTop();
      } else {
        this.unitVariableValues[item.name] = value;
        await this.advanceUnit();
      }
      this.lastFailedOperation = null;
    } catch (err) {
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async advanceTop(): Promise<void> {
    this.topSteps = await computeTopLevelSteps(this.items, this.conditionValues, this.expressionCache);
    this.topIndex += 1;
    const next = this.topSteps[this.topIndex];

    if (!next) {
      this.publish({ phase: "finished", currentItem: null, currentUnit: null, currentUnitLayout: null, currentUnitVariables: null });
      return;
    }

    if (next.type === "unit_loop") {
      this.activeLoop = next;
      this.currentUnit = null;
      this.loopIndex = -1;
      await this.advanceUnit();
      return;
    }

    this.publish({ phase: "user_variable", currentItem: next, currentUnit: null, currentUnitLayout: null, currentUnitVariables: null });
  }

  private async advanceUnit(): Promise<void> {
    if (!this.activeLoop) return;

    if (this.currentUnit) {
      this.loopSteps = await computeLoopSteps(this.items, this.activeLoop.position, this.conditionValues, this.expressionCache);
      this.loopIndex += 1;
      const next = this.loopSteps[this.loopIndex];
      if (next) {
        this.publish({
          phase: "unit_variable",
          currentItem: next,
          currentUnit: this.currentUnit,
          currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
          currentUnitVariables: { ...this.unitVariableValues },
        });
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

  /**
   * Resolves a unit_loop layout's `{{ expression }}` interpolation (design
   * plan §11f) against this unit's data columns, the layout's own
   * `constants`, and known variable values (conditionValues -- highest
   * precedence, since they're the "live" facts a template conditional like
   * `{{is_experiment ? experiment_intro : control_intro}}` branches on).
   * `renderTemplate` is async (real QuickJS evaluation), so this is done
   * once per unit here -- in the already-async step-computation flow --
   * rather than at React-render time, keeping `UnitFields` synchronous.
   */
  private async resolveUnitLayout(layout: UnitLayout, unit: CoderUnitResponse): Promise<UnitLayout> {
    const values: Record<string, unknown> = { ...unit.data, ...layout.constants, ...this.conditionValues };
    const template = await renderTemplate(
      layout.template,
      values,
      this.expressionCache,
      `template:${this.activeLoop?.position ?? "unknown"}`,
    );
    return { ...layout, template };
  }
}
