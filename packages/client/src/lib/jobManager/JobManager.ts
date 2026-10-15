import type {
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  UnitLoopItem,
  UnitLayout,
  VariableValue,
  CoderUnitResponse,
  SessionResponse,
  AnyVariableType,
} from "@annotinder/contracts";
import { validateAnswer } from "@annotinder/contracts";
import type { JobServer } from "../api/httpJobServer";
import { ExpressionCache } from "../codebook/expressionCache";
import { computeLoopSteps, computeTopLevelSteps } from "../codebook/tree";
import { renderTemplate } from "../codebook/renderTemplate";

export type JobManagerPhase =
  | "loading"
  | "user_variable"
  | "unit_variable"
  | "finished"
  | "error";

export interface NavigationUnitItem {
  index: number;
  id: number;
  externalId: string;
  isCurrent: boolean;
}

export interface NavigationUnitQuestion {
  index: number;
  name: string;
  label: string;
  isCurrent: boolean;
  isCompleted: boolean;
}

export interface NavigationPhase {
  index: number;
  name: string;
  type: "user_variable" | "unit_loop" | "condition" | "question";
  label: string;
  isCurrent: boolean;
  isCompleted: boolean;
  unitCount?: number;
  /** Units this coder will get in the loop, if known (from the job server). */
  totalUnits?: number;
  currentUnitIndex?: number;
  units?: NavigationUnitItem[];
  questions?: NavigationUnitQuestion[];
}

export interface JobManagerNavigation {
  canGoBack: boolean;
  canGoForward: boolean;
  phases: NavigationPhase[];
  currentPhaseIndex: number;
  currentUnitIndex?: number;
  totalUnitsInHistory: number;
  maxReachedTopIndex: number;
}

export interface JobManagerSnapshot {
  phase: JobManagerPhase;
  currentItem: CodebookItem | null;
  currentUnit: CoderUnitResponse | null;
  currentUnitLayout: UnitLayout | null;
  userVariableValues: Record<string, VariableValue>;
  currentUnitVariables: Record<string, VariableValue> | null;
  error: string | null;
  /** Machine-readable error code from the job server (e.g. `participant_has_session`), if any. */
  errorCode: string | null;
  navigation: JobManagerNavigation;
}

export type JobManagerListener = () => void;

/**
 * A unit in a loop's history. Units finished in an earlier visit (resumed
 * session) start as just an id; content and answers are loaded when the
 * coder navigates to them.
 */
interface UnitHistoryEntry {
  unitId: number;
  unit: CoderUnitResponse | null;
  answers: Record<string, VariableValue> | null;
}

interface LoopHistory {
  entries: UnitHistoryEntry[];
  index: number;
}

/** Questions of a loop (through conditions) by name, as defined by the current codebook. */
function loopVariables(loop: UnitLoopItem): Map<string, AnyVariableType> {
  const result = new Map<string, AnyVariableType>();
  const walk = (items: InLoopItem[]) => {
    for (const item of items) {
      if (item.type === "condition") walk(item.children);
      else result.set(item.name, item.variable);
    }
  };
  walk(loop.children);
  return result;
}

/**
 * Answers that still fit the current codebook. Answers to questions that no
 * longer exist, or with codes the question no longer has, are left out, so
 * the coder is asked again (the job server keeps answers to removed
 * questions in the database). See docs/architecture.md §8.
 */
function currentAnswers(
  answers: Record<string, VariableValue>,
  variables: Map<string, AnyVariableType>,
): Record<string, VariableValue> {
  return Object.fromEntries(
    Object.entries(answers).filter(([name, value]) => {
      const variable = variables.get(name);
      return variable !== undefined && validateAnswer(name, variable, value).length === 0;
    }),
  );
}

function errorCodeOf(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

function getQuestionLabel(item: CodebookItem): string {
  if ("variable" in item && item.variable && "question" in item.variable) {
    const q = item.variable.question;
    if (typeof q === "string" && q.trim().length > 0) {
      return q.trim().split("\n")[0];
    }
  }
  return item.name;
}

function extractUnitQuestions(items: InLoopItem[]): NavigationUnitQuestion[] {
  const result: NavigationUnitQuestion[] = [];
  function walk(subItems: InLoopItem[]) {
    for (const sub of subItems) {
      if (sub.type === "unit_variable" || sub.type === "question") {
        result.push({
          index: result.length,
          name: sub.name,
          label: getQuestionLabel(sub),
          isCurrent: false,
          isCompleted: false,
        });
      } else if (sub.type === "condition" && sub.children) {
        walk(sub.children);
      }
    }
  }
  walk(items);
  return result;
}

/**
 * Client-side runtime manager driving a single coder's interactive session
 * (design plan §5/3.2), supporting full forwards/backwards navigation,
 * phase jumping, and editing previously submitted answers.
 */
export class JobManager {
  private items: TopLevelItem[] = [];
  private jobServer: JobServer;
  private listeners: Set<JobManagerListener> = new Set();
  private expressionCache = new ExpressionCache();

  private topSteps: CodebookItem[] = [];
  private topIndex = -1;
  private maxReachedTopIndex = 0;
  private activeLoop: UnitLoopItem | null = null;
  private currentUnit: CoderUnitResponse | null = null;
  private loopSteps: CodebookItem[] = [];
  private loopIndex = -1;

  private userVariableValues: Record<string, VariableValue> = {};
  private unitVariableValues: Record<string, VariableValue> = {};
  /** Per unit_loop: the units seen in this session (plus, after a resume, those finished earlier). */
  private histories = new Map<string, LoopHistory>();
  /** Per unit_loop: finished unit ids and expected total, from the session. */
  private progress = new Map<string, { doneUnitIds: number[]; totalUnits?: number | null }>();
  /** True while restoring a resumed session: answered questions are skipped until one needs input. */
  private resuming = false;
  private conditionValues: Record<string, unknown> = {};

  private lastFailedOperation: (() => Promise<void>) | null = null;
  private starting: Promise<void> | null = null;

  private snapshot: JobManagerSnapshot = {
    phase: "loading",
    currentItem: null,
    currentUnit: null,
    currentUnitLayout: null,
    userVariableValues: {},
    currentUnitVariables: null,
    error: null,
    errorCode: null,
    navigation: {
      canGoBack: false,
      canGoForward: false,
      phases: [],
      currentPhaseIndex: 0,
      totalUnitsInHistory: 0,
      maxReachedTopIndex: 0,
    },
  };

  constructor(jobServer: JobServer) {
    this.jobServer = jobServer;
  }

  getSnapshot(): JobManagerSnapshot {
    return this.snapshot;
  }

  subscribe(listener: JobManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Loads the session and moves to where the coder left off. Idempotent:
   * calling it again while (or after) it runs reuses the same start, so
   * React StrictMode's double effects don't interleave two starts.
   */
  start(): Promise<void> {
    this.starting ??= this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<void> {
    try {
      this.publish({ phase: "loading", error: null, errorCode: null });
      const session: SessionResponse = await this.jobServer.getSession();
      this.items = session.codebook.items as TopLevelItem[];
      // Coder-level variables so far, including server-assigned `auto`
      // variables (condition, slot, ...), so conditions can use them.
      for (const [name, value] of Object.entries(session.variables ?? {})) {
        this.userVariableValues[name] = value;
        this.recordConditionValue(name, value);
      }
      this.topIndex = -1;
      this.maxReachedTopIndex = 0;
      this.histories.clear();
      this.progress = new Map(session.progress.map((p) => [p.unitset, p]));
      // Resume where the coder left off: skip answered questions and
      // finished units (they stay reachable by navigating back).
      this.resuming = true;
      await this.advanceTop();
    } catch (err) {
      this.starting = null;
      this.lastFailedOperation = () => this.start();
      this.publish({
        phase: "error",
        error: err instanceof Error ? err.message : String(err),
        errorCode: errorCodeOf(err),
      });
    }
  }

  private history(loop: UnitLoopItem | null = this.activeLoop): LoopHistory {
    const name = loop?.name ?? "";
    let history = this.histories.get(name);
    if (!history) {
      const done = this.progress.get(name)?.doneUnitIds ?? [];
      history = { entries: done.map((unitId) => ({ unitId, unit: null, answers: null })), index: -1 };
      this.histories.set(name, history);
    }
    return history;
  }

  private get unitHistory(): UnitHistoryEntry[] {
    return this.history().entries;
  }

  private get unitHistoryIndex(): number {
    return this.history().index;
  }

  private set unitHistoryIndex(index: number) {
    this.history().index = index;
  }

  /** Makes a history entry the current unit, loading it from the job server if needed. */
  private async openEntry(index: number): Promise<void> {
    const loop = this.activeLoop!;
    const entry = this.unitHistory[index];
    if (!entry.unit) {
      const unit = await this.jobServer.getLoopUnit(loop.name, entry.unitId);
      entry.unit = unit;
      entry.answers = { ...(unit.variables ?? {}) };
    }
    this.unitHistoryIndex = index;
    this.currentUnit = entry.unit;
    this.unitVariableValues = currentAnswers(entry.answers ?? {}, loopVariables(loop));
  }

  /** Whether a top-level question already has an answer that fits the current codebook. */
  private hasValidAnswer(item: CodebookItem): boolean {
    if (!("variable" in item)) return false;
    const value = this.userVariableValues[item.name];
    return value !== undefined && validateAnswer(item.name, item.variable, value).length === 0;
  }

  canGoBack(): boolean {
    if (this.snapshot.phase === "loading" || this.snapshot.phase === "error" || this.snapshot.phase === "finished") {
      return false;
    }
    if (this.loopIndex > 0) return true;
    if (this.unitHistoryIndex > 0) return true;
    if (this.topIndex > 0) return true;
    return false;
  }

  canGoForward(allowFree = false): boolean {
    if (this.snapshot.phase === "loading" || this.snapshot.phase === "error" || this.snapshot.phase === "finished") {
      return false;
    }
    if (allowFree) {
      if (this.loopIndex < this.loopSteps.length - 1) return true;
      if (this.unitHistoryIndex < this.unitHistory.length - 1) return true;
      if (this.topIndex < this.topSteps.length - 1) return true;
      return false;
    }
    if (this.loopIndex < this.loopSteps.length - 1) {
      const currentItem = this.loopSteps[this.loopIndex];
      if (currentItem && this.unitVariableValues[currentItem.name] !== undefined) return true;
    }
    if (this.unitHistoryIndex < this.unitHistory.length - 1) return true;
    if (this.topIndex < this.maxReachedTopIndex) return true;
    return false;
  }

  async goBack(): Promise<void> {
    if (!this.canGoBack()) return;

    this.syncCurrentUnitAnswers();

    // 1. Step backward within current unit's questions
    if (this.loopIndex > 0) {
      this.loopIndex -= 1;
      const step = this.loopSteps[this.loopIndex];
      this.publish({
        phase: "unit_variable",
        currentItem: step,
        currentUnit: this.currentUnit,
        currentUnitLayout: this.activeLoop ? await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!) : null,
        currentUnitVariables: { ...this.unitVariableValues },
      });
      return;
    }

    // 2. Step backward to previous unit in history
    if (this.unitHistoryIndex > 0 && this.activeLoop) {
      await this.openEntry(this.unitHistoryIndex - 1);
      this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
      this.loopIndex = Math.max(0, this.loopSteps.length - 1);
      const step = this.loopSteps[this.loopIndex];
      this.publish({
        phase: "unit_variable",
        currentItem: step,
        currentUnit: this.currentUnit,
        currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
        currentUnitVariables: { ...this.unitVariableValues },
      });
      return;
    }

    // 3. Step backward to previous top-level item
    if (this.topIndex > 0) {
      this.topIndex -= 1;
      const prevTop = this.topSteps[this.topIndex];

      if (prevTop.type === "unit_loop") {
        this.activeLoop = prevTop as UnitLoopItem;
        if (this.unitHistory.length > 0) {
          await this.openEntry(this.unitHistory.length - 1);
          this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
          this.loopIndex = Math.max(0, this.loopSteps.length - 1);
          const step = this.loopSteps[this.loopIndex];
          this.publish({
            phase: "unit_variable",
            currentItem: step,
            currentUnit: this.currentUnit,
            currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
            currentUnitVariables: { ...this.unitVariableValues },
          });
          return;
        }
      }

      this.activeLoop = null;
      this.currentUnit = null;
      this.publish({
        phase: "user_variable",
        currentItem: prevTop,
        currentUnit: null,
        currentUnitLayout: null,
        currentUnitVariables: null,
      });
    }
  }

  async goForward(allowFree = false): Promise<void> {
    if (!this.canGoForward(allowFree)) return;

    this.syncCurrentUnitAnswers();

    // 1. Forward within questions of current unit
    if (this.loopIndex < this.loopSteps.length - 1) {
      this.loopIndex += 1;
      const step = this.loopSteps[this.loopIndex];
      this.publish({
        phase: "unit_variable",
        currentItem: step,
        currentUnit: this.currentUnit,
        currentUnitLayout: this.activeLoop ? await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!) : null,
        currentUnitVariables: { ...this.unitVariableValues },
      });
      return;
    }

    // 2. Forward to next unit in history
    if (this.unitHistoryIndex < this.unitHistory.length - 1 && this.activeLoop) {
      await this.openEntry(this.unitHistoryIndex + 1);
      this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
      this.loopIndex = 0;
      const step = this.loopSteps[0];
      this.publish({
        phase: "unit_variable",
        currentItem: step,
        currentUnit: this.currentUnit,
        currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
        currentUnitVariables: { ...this.unitVariableValues },
      });
      return;
    }

    // 3. Forward to next top-level item
    const canAdvanceTop = allowFree
      ? this.topIndex < this.topSteps.length - 1
      : this.topIndex < this.maxReachedTopIndex;

    if (canAdvanceTop) {
      this.topIndex += 1;
      const nextTop = this.topSteps[this.topIndex];
      if (nextTop.type === "unit_loop") {
        this.activeLoop = nextTop as UnitLoopItem;
        this.currentUnit = null;
        this.loopIndex = -1;
        await this.advanceUnit();
      } else {
        this.activeLoop = null;
        this.currentUnit = null;
        this.publish({
          phase: "user_variable",
          currentItem: nextTop,
          currentUnit: null,
          currentUnitLayout: null,
          currentUnitVariables: null,
        });
      }
    }
  }

  async jumpToUnit(unitIndex: number, allowFetchAhead = false): Promise<void> {
    if (!this.activeLoop) return;
    this.syncCurrentUnitAnswers();

    // In preview mode with allowFetchAhead: fetch units ahead up to target unitIndex
    while (allowFetchAhead && this.unitHistory.length <= unitIndex) {
      const nextUnit = await this.jobServer.getNextUnit(this.activeLoop.name);
      if (!nextUnit) break;
      this.unitHistory.push({ unitId: nextUnit.id, unit: nextUnit, answers: { ...(nextUnit.variables ?? {}) } });
    }

    if (this.unitHistory.length === 0) return;
    const target = Math.max(0, Math.min(unitIndex, this.unitHistory.length - 1));

    await this.openEntry(target);
    this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
    this.loopIndex = 0;
    this.publish({
      phase: "unit_variable",
      currentItem: this.loopSteps[0],
      currentUnit: this.currentUnit,
      currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
      currentUnitVariables: { ...this.unitVariableValues },
    });
  }

  async jumpToLoopStep(stepIndex: number, allowAhead = false): Promise<void> {
    if (!this.activeLoop || !this.currentUnit || stepIndex < 0 || stepIndex >= this.loopSteps.length) return;
    if (!allowAhead) {
      const hasUnansweredEarlier = this.loopSteps
        .slice(0, stepIndex)
        .some((q) => this.unitVariableValues[q.name] === undefined);
      if (hasUnansweredEarlier && stepIndex > this.loopIndex) return;
    }
    this.syncCurrentUnitAnswers();
    this.loopIndex = stepIndex;
    const step = this.loopSteps[this.loopIndex];
    this.publish({
      phase: "unit_variable",
      currentItem: step,
      currentUnit: this.currentUnit,
      currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
      currentUnitVariables: { ...this.unitVariableValues },
    });
  }

  async jumpToUnitQuestion(phaseIndex: number, stepIndex: number, allowAhead = false): Promise<void> {
    if (phaseIndex < 0 || phaseIndex >= this.topSteps.length) return;
    if (this.topIndex !== phaseIndex) {
      await this.jumpToPhase(phaseIndex, allowAhead);
    }
    if (this.activeLoop && this.currentUnit && stepIndex >= 0 && stepIndex < this.loopSteps.length) {
      await this.jumpToLoopStep(stepIndex, allowAhead);
    }
  }

  async jumpToPhase(phaseIndex: number, allowAhead = false): Promise<void> {
    if (phaseIndex < 0 || phaseIndex >= this.topSteps.length) return;
    if (!allowAhead && phaseIndex > this.maxReachedTopIndex) return;
    if (phaseIndex === this.topIndex && this.activeLoop) return;

    this.syncCurrentUnitAnswers();
    this.topIndex = phaseIndex;
    const target = this.topSteps[phaseIndex];

    if (target.type === "unit_loop") {
      this.activeLoop = target as UnitLoopItem;
      // Back to where the coder was in this loop; or, if they haven't been
      // in it during this visit (e.g. resumed session), to the frontier.
      if (this.unitHistoryIndex >= 0) {
        await this.openEntry(Math.min(this.unitHistoryIndex, this.unitHistory.length - 1));
        this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
        this.loopIndex = 0;
        this.publish({
          phase: "unit_variable",
          currentItem: this.loopSteps[0],
          currentUnit: this.currentUnit,
          currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
          currentUnitVariables: { ...this.unitVariableValues },
        });
      } else {
        this.currentUnit = null;
        this.loopIndex = -1;
        await this.advanceUnit();
      }
    } else {
      this.activeLoop = null;
      this.currentUnit = null;
      this.publish({
        phase: "user_variable",
        currentItem: target,
        currentUnit: null,
        currentUnitLayout: null,
        currentUnitVariables: null,
      });
    }
  }

  async answer(value: VariableValue, conditionValue?: unknown): Promise<void> {
    const item = this.snapshot.currentItem;
    if (!item || (item.type !== "user_variable" && item.type !== "unit_variable" && item.type !== "question")) return;

    this.lastFailedOperation = () => this.answer(value, conditionValue);
    if (conditionValue !== undefined) {
      this.conditionValues[item.name] = conditionValue;
    } else {
      this.recordConditionValue(item.name, value);
    }

    try {
      const isUnit = item.type === "unit_variable" || (item.type === "question" && this.activeLoop !== null);
      if (!isUnit) {
        this.userVariableValues[item.name] = value;
        await this.jobServer.postCoderVariables(this.userVariableValues);
        await this.advanceTop();
      } else {
        this.unitVariableValues[item.name] = value;
        await this.advanceUnit();
      }
      this.lastFailedOperation = null;
    } catch (err) {
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err), errorCode: errorCodeOf(err) });
    }
  }

  async submitAnswer(value: VariableValue): Promise<void> {
    return this.answer(value);
  }

  async retry(): Promise<void> {
    const op = this.lastFailedOperation;
    if (!op) return;
    await op();
  }

  private syncCurrentUnitAnswers(): void {
    if (this.currentUnit && this.unitHistoryIndex >= 0 && this.unitHistoryIndex < this.unitHistory.length) {
      this.unitHistory[this.unitHistoryIndex].answers = { ...this.unitVariableValues };
    }
  }

  private recordConditionValue(name: string, value: VariableValue): void {
    if (value && typeof value === "object" && "value" in value) {
      this.conditionValues[name] = (value as { value: unknown }).value;
    } else {
      this.conditionValues[name] = value;
    }
  }

  private async resolveUnitLayout(layout: UnitLayout, unit: CoderUnitResponse): Promise<UnitLayout> {
    try {
      const scope = {
        ...layout.constants,
        ...unit.data,
        $unit: unit.data,
        ...this.conditionValues,
      };
      const rendered = await renderTemplate(layout.template, scope, this.expressionCache);
      return { ...layout, template: rendered };
    } catch (err) {
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err), errorCode: errorCodeOf(err) });
      return layout;
    }
  }

  private async advanceTop(): Promise<void> {
    this.topSteps = await computeTopLevelSteps(this.items, this.conditionValues, this.expressionCache);
    this.topIndex += 1;
    this.maxReachedTopIndex = Math.max(this.maxReachedTopIndex, this.topIndex);
    const next = this.topSteps[this.topIndex];

    if (!next) {
      this.publish({
        phase: "finished",
        currentItem: null,
        currentUnit: null,
        currentUnitLayout: null,
        currentUnitVariables: null,
      });
      return;
    }

    if (next.type === "unit_loop") {
      this.activeLoop = next as UnitLoopItem;
      this.currentUnit = null;
      this.loopIndex = -1;
      await this.advanceUnit();
      return;
    }

    if (this.resuming && this.hasValidAnswer(next)) {
      await this.advanceTop();
      return;
    }

    this.resuming = false;
    this.publish({
      phase: "user_variable",
      currentItem: next,
      currentUnit: null,
      currentUnitLayout: null,
      currentUnitVariables: null,
    });
  }

  private async advanceUnit(): Promise<void> {
    if (!this.activeLoop) return;

    // Advance loop question step within the current unit
    if (this.currentUnit) {
      this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
      this.loopIndex += 1;
      const next = this.loopSteps[this.loopIndex];
      if (next) {
        this.publish({
          phase: "unit_variable",
          currentItem: next,
          currentUnit: this.currentUnit,
          currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
          currentUnitVariables: { ...this.unitVariableValues },
        });
        return;
      }

      // No more steps for this unit: post answers to server
      const doneValues: Record<string, VariableValue> = {};
      for (const [name, value] of Object.entries(this.unitVariableValues)) doneValues[name] = { ...value, done: true };
      await this.jobServer.postUnitVariables(this.currentUnit.id, doneValues);
      if (this.currentUnit && this.unitHistoryIndex >= 0 && this.unitHistoryIndex < this.unitHistory.length) {
        this.unitHistory[this.unitHistoryIndex].answers = { ...doneValues };
      }

      // If reviewing an earlier unit in history, advance to the next unit in history
      if (this.unitHistoryIndex < this.unitHistory.length - 1) {
        await this.openEntry(this.unitHistoryIndex + 1);
        this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
        this.loopIndex = 0;
        const firstStep = this.loopSteps[0];
        if (firstStep) {
          this.publish({
            phase: "unit_variable",
            currentItem: firstStep,
            currentUnit: this.currentUnit,
            currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
            currentUnitVariables: { ...this.unitVariableValues },
          });
          return;
        }
      }

      this.unitVariableValues = {};
      this.currentUnit = null;
    }

    // At frontier: ask the job server for the next unit of this loop.
    const nextUnit = await this.jobServer.getNextUnit(this.activeLoop.name);
    if (!nextUnit) {
      // Loop finished: advance to the next top-level item.
      this.activeLoop = null;
      await this.advanceTop();
      return;
    }

    this.unitHistory.push({ unitId: nextUnit.id, unit: nextUnit, answers: { ...(nextUnit.variables ?? {}) } });
    await this.openEntry(this.unitHistory.length - 1);

    this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
    // Start at the first question without a (still valid) answer: the unit
    // may be partly done (reload mid-unit, or the codebook gained a question).
    const firstOpen = this.loopSteps.findIndex((step) => this.unitVariableValues[step.name] === undefined);
    this.loopIndex = firstOpen === -1 ? Math.max(0, this.loopSteps.length - 1) : firstOpen;
    const firstStep = this.loopSteps[this.loopIndex];
    if (!firstStep) {
      // Degenerate loop with no steps: immediately move past it.
      await this.advanceUnit();
      return;
    }

    this.resuming = false;
    this.publish({
      phase: "unit_variable",
      currentItem: firstStep,
      currentUnit: this.currentUnit,
      currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit!),
      currentUnitVariables: { ...this.unitVariableValues },
    });
  }

  private buildNavigation(): JobManagerNavigation {
    const phases: NavigationPhase[] = this.topSteps.map((step, idx) => {
      const isCurrent = idx === this.topIndex;
      const isCompleted = idx < this.topIndex;

      let questions: NavigationUnitQuestion[] | undefined;
      let unitCount: number | undefined;
      let units: NavigationUnitItem[] | undefined;
      let currentUnitIndex: number | undefined;

      let totalUnits: number | undefined;
      if (step.type === "unit_loop") {
        const history = this.history(step);
        unitCount = history.entries.length;
        totalUnits = this.progress.get(step.name)?.totalUnits ?? undefined;
        if (isCurrent && this.activeLoop) {
          currentUnitIndex = history.index >= 0 ? history.index : 0;
          units = history.entries.map((h, hIdx) => ({
            index: hIdx,
            id: h.unitId,
            externalId: h.unit?.externalId ?? `#${h.unitId}`,
            isCurrent: hIdx === history.index,
          }));

          const extracted = extractUnitQuestions(step.children);
          questions = extracted.map((q) => {
            const isQCurrent = q.index === this.loopIndex;
            const isQCompleted = q.index < this.loopIndex;
            return {
              ...q,
              isCurrent: isQCurrent,
              isCompleted: isQCompleted,
            };
          });
        }
      }

      return {
        index: idx,
        name: step.name,
        type: step.type as NavigationPhase["type"],
        label: getQuestionLabel(step),
        isCurrent,
        isCompleted,
        unitCount,
        totalUnits,
        currentUnitIndex,
        units,
        questions,
      };
    });

    return {
      canGoBack: this.canGoBack(),
      canGoForward: this.canGoForward(),
      phases,
      currentPhaseIndex: this.topIndex,
      currentUnitIndex: this.activeLoop ? this.unitHistoryIndex : undefined,
      totalUnitsInHistory: this.unitHistory.length,
      maxReachedTopIndex: this.maxReachedTopIndex,
    };
  }

  private publish(next: Partial<JobManagerSnapshot>): void {
    // Navigation (canGoBack etc.) depends on the new phase, so set that first.
    this.snapshot = { ...this.snapshot, userVariableValues: { ...this.userVariableValues }, ...next };
    this.snapshot = { ...this.snapshot, navigation: this.buildNavigation() };
    for (const listener of this.listeners) listener();
  }
}
