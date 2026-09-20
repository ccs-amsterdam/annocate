import type {
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  UnitLoopItem,
  UnitLayout,
  VariableValue,
  CoderUnitResponse,
  SessionResponse,
} from "@annotinder/contracts";
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
  type: "user_variable" | "unit_loop" | "condition";
  label: string;
  isCurrent: boolean;
  isCompleted: boolean;
  unitCount?: number;
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
  currentUnitVariables: Record<string, VariableValue> | null;
  userVariableValues: Record<string, VariableValue>;
  error: string | null;
  hasRetry?: boolean;
  navigation: JobManagerNavigation;
}

interface UnitHistoryEntry {
  unit: CoderUnitResponse;
  answers: Record<string, VariableValue>;
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
      if (sub.type === "unit_variable") {
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
  /** name -> the "plain" value used for condition evaluation (e.g. a picked code string). */
  private conditionValues: Record<string, unknown> = {};
  private userVariableValues: Record<string, VariableValue> = {};
  private unitVariableValues: Record<string, VariableValue> = {};

  private topSteps: CodebookItem[] = [];
  private topIndex = -1;
  private maxReachedTopIndex = 0;
  private activeLoop: UnitLoopItem | null = null;
  private currentUnit: CoderUnitResponse | null = null;
  private loopSteps: CodebookItem[] = [];
  private loopIndex = -1;
  private expressionCache = new ExpressionCache();

  private unitHistory: UnitHistoryEntry[] = [];
  private unitHistoryIndex = -1;

  private listeners = new Set<() => void>();
  private snapshot: JobManagerSnapshot = {
    phase: "loading",
    currentItem: null,
    currentUnit: null,
    currentUnitLayout: null,
    currentUnitVariables: null,
    userVariableValues: {},
    error: null,
    navigation: {
      canGoBack: false,
      canGoForward: false,
      phases: [],
      currentPhaseIndex: 0,
      totalUnitsInHistory: 0,
      maxReachedTopIndex: 0,
    },
  };

  private lastFailedOperation: (() => Promise<void>) | null = null;

  constructor(private jobServer: JobServer) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): JobManagerSnapshot {
    return this.snapshot;
  }

  async start(): Promise<void> {
    this.lastFailedOperation = () => this.start();
    try {
      const session: SessionResponse = await this.jobServer.getSession();
      this.items = session.codebook.items as TopLevelItem[];
      this.topIndex = -1;
      this.maxReachedTopIndex = 0;
      this.unitHistory = [];
      this.unitHistoryIndex = -1;
      await this.advanceTop();
      this.lastFailedOperation = null;
    } catch (err) {
      this.publish({
        phase: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async init(): Promise<void> {
    return this.start();
  }

  canGoBack(): boolean {
    if (this.snapshot.phase === "loading" || this.snapshot.phase === "error") return false;
    if (this.snapshot.phase === "finished") return this.unitHistory.length > 0 || this.topIndex > 0;
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

    // Persist in-progress answers before navigating
    this.syncCurrentUnitAnswers();

    // 1. Within questions of the current unit
    if (this.loopIndex > 0) {
      this.loopIndex -= 1;
      const step = this.loopSteps[this.loopIndex];
      this.publish({
        phase: "unit_variable",
        currentItem: step,
        currentUnit: this.currentUnit,
        currentUnitVariables: { ...this.unitVariableValues },
      });
      return;
    }

    // 2. Previous unit in the unit loop
    if (this.unitHistoryIndex > 0 && this.activeLoop) {
      this.unitHistoryIndex -= 1;
      const entry = this.unitHistory[this.unitHistoryIndex];
      this.currentUnit = entry.unit;
      this.unitVariableValues = { ...entry.answers };
      this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
      this.loopIndex = Math.max(0, this.loopSteps.length - 1);
      const step = this.loopSteps[this.loopIndex];
      this.publish({
        phase: "unit_variable",
        currentItem: step,
        currentUnit: this.currentUnit,
        currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
        currentUnitVariables: { ...this.unitVariableValues },
      });
      return;
    }

    // 3. Previous top-level phase
    if (this.topIndex > 0) {
      this.topIndex -= 1;
      const prevTop = this.topSteps[this.topIndex];
      if (prevTop.type === "unit_loop") {
        this.activeLoop = prevTop as UnitLoopItem;
        if (this.unitHistory.length > 0) {
          this.unitHistoryIndex = this.unitHistory.length - 1;
          const entry = this.unitHistory[this.unitHistoryIndex];
          this.currentUnit = entry.unit;
          this.unitVariableValues = { ...entry.answers };
          this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
          this.loopIndex = Math.max(0, this.loopSteps.length - 1);
          this.publish({
            phase: "unit_variable",
            currentItem: this.loopSteps[this.loopIndex],
            currentUnit: this.currentUnit,
            currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
            currentUnitVariables: { ...this.unitVariableValues },
          });
        } else {
          this.currentUnit = null;
          await this.advanceUnit();
        }
      } else {
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
  }

  async goForward(allowFree = false): Promise<void> {
    if (!this.canGoForward(allowFree)) return;

    this.syncCurrentUnitAnswers();

    // 1. Within questions of current unit
    if (this.loopIndex < this.loopSteps.length - 1) {
      this.loopIndex += 1;
      const step = this.loopSteps[this.loopIndex];
      this.publish({
        phase: "unit_variable",
        currentItem: step,
        currentUnit: this.currentUnit,
        currentUnitVariables: { ...this.unitVariableValues },
      });
      return;
    }

    // 2. Forward to next unit already in history
    if (this.unitHistoryIndex < this.unitHistory.length - 1 && this.activeLoop) {
      this.unitHistoryIndex += 1;
      const entry = this.unitHistory[this.unitHistoryIndex];
      this.currentUnit = entry.unit;
      this.unitVariableValues = { ...entry.answers };
      this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
      this.loopIndex = 0;
      this.publish({
        phase: "unit_variable",
        currentItem: this.loopSteps[0],
        currentUnit: this.currentUnit,
        currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
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
      const nextUnit = await this.jobServer.getNextUnit(this.activeLoop.unitset);
      if (!nextUnit) break;
      const initialAnswers = { ...(nextUnit.variables ?? {}) };
      this.unitHistory.push({ unit: nextUnit, answers: initialAnswers });
    }

    if (this.unitHistory.length === 0) return;
    const target = Math.max(0, Math.min(unitIndex, this.unitHistory.length - 1));

    this.unitHistoryIndex = target;
    const entry = this.unitHistory[target];
    this.currentUnit = entry.unit;
    this.unitVariableValues = { ...entry.answers };
    this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
    this.loopIndex = 0;
    this.publish({
      phase: "unit_variable",
      currentItem: this.loopSteps[0],
      currentUnit: this.currentUnit,
      currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
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
      currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
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
      if (this.unitHistory.length > 0) {
        this.unitHistoryIndex = Math.min(Math.max(0, this.unitHistoryIndex), this.unitHistory.length - 1);
        const entry = this.unitHistory[this.unitHistoryIndex];
        this.currentUnit = entry.unit;
        this.unitVariableValues = { ...entry.answers };
        this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
        this.loopIndex = 0;
        this.publish({
          phase: "unit_variable",
          currentItem: this.loopSteps[0],
          currentUnit: this.currentUnit,
          currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
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
    if (!item || (item.type !== "user_variable" && item.type !== "unit_variable")) return;

    this.lastFailedOperation = () => this.answer(value, conditionValue);
    if (conditionValue !== undefined) {
      this.conditionValues[item.name] = conditionValue;
    } else {
      this.recordConditionValue(item.name, value);
    }

    try {
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
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err) });
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

    if (this.currentUnit) {
      this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
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

      // No more steps for this unit: post answers to server
      const doneValues: Record<string, VariableValue> = {};
      for (const [name, value] of Object.entries(this.unitVariableValues)) doneValues[name] = { ...value, done: true };
      await this.jobServer.postUnitVariables(this.currentUnit.id, doneValues);
      if (this.currentUnit && this.unitHistoryIndex >= 0 && this.unitHistoryIndex < this.unitHistory.length) {
        this.unitHistory[this.unitHistoryIndex].answers = { ...doneValues };
      }

      // If reviewing an earlier unit in history, advance to the next unit in history
      if (this.unitHistoryIndex < this.unitHistory.length - 1) {
        this.unitHistoryIndex += 1;
        const nextEntry = this.unitHistory[this.unitHistoryIndex];
        this.currentUnit = nextEntry.unit;
        this.unitVariableValues = { ...nextEntry.answers };
        this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
        this.loopIndex = 0;
        const firstStep = this.loopSteps[0];
        if (firstStep) {
          this.publish({
            phase: "unit_variable",
            currentItem: firstStep,
            currentUnit: this.currentUnit,
            currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
            currentUnitVariables: { ...this.unitVariableValues },
          });
          return;
        }
      }

      this.unitVariableValues = {};
      this.currentUnit = null;
    }

    // At frontier: Fetch the next unit from the unitset.
    const nextUnit = await this.jobServer.getNextUnit(this.activeLoop.unitset);
    if (!nextUnit) {
      // Loop finished: advance to the next top-level item.
      this.activeLoop = null;
      await this.advanceTop();
      return;
    }

    this.currentUnit = nextUnit;
    const initialAnswers = { ...(nextUnit.variables ?? {}) };
    this.unitHistory.push({ unit: nextUnit, answers: initialAnswers });
    this.unitHistoryIndex = this.unitHistory.length - 1;

    this.loopSteps = await computeLoopSteps(this.activeLoop, this.conditionValues, this.expressionCache);
    this.loopIndex = 0;
    const firstStep = this.loopSteps[0];
    if (!firstStep) {
      // Degenerate loop with no steps: immediately move past it.
      await this.advanceUnit();
      return;
    }

    this.unitVariableValues = { ...initialAnswers };
    this.publish({
      phase: "unit_variable",
      currentItem: firstStep,
      currentUnit: this.currentUnit,
      currentUnitLayout: await this.resolveUnitLayout(this.activeLoop.layout, this.currentUnit),
      currentUnitVariables: { ...this.unitVariableValues },
    });
  }

  private buildNavigation(): JobManagerNavigation {
    const phases: NavigationPhase[] = this.topSteps.map((step, idx) => {
      const isCurrent = idx === this.topIndex;
      const isCompleted = idx < this.topIndex;
      const label = getQuestionLabel(step);

      const phase: NavigationPhase = {
        index: idx,
        name: step.name,
        type: step.type as NavigationPhase["type"],
        label,
        isCurrent,
        isCompleted,
      };

      if (step.type === "unit_loop") {
        phase.unitCount = this.unitHistory.length;
        phase.currentUnitIndex = isCurrent ? this.unitHistoryIndex : undefined;
        phase.units = this.unitHistory.map((entry, uIdx) => ({
          index: uIdx,
          id: entry.unit.id,
          externalId: entry.unit.externalId,
          isCurrent: isCurrent && uIdx === this.unitHistoryIndex,
        }));

        if (isCurrent && this.activeLoop) {
          phase.questions = this.loopSteps.map((q, qIdx) => ({
            index: qIdx,
            name: q.name,
            label: getQuestionLabel(q),
            isCurrent: isCurrent && qIdx === this.loopIndex,
            isCompleted: Boolean(this.unitVariableValues[q.name] !== undefined),
          }));
        } else {
          phase.questions = extractUnitQuestions(step.children || []);
        }
      }

      return phase;
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
    this.snapshot = {
      ...this.snapshot,
      userVariableValues: { ...this.userVariableValues },
      ...next,
      navigation: this.buildNavigation(),
    };
    for (const listener of this.listeners) listener();
  }
}
