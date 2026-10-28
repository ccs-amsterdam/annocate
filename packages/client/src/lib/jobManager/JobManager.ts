import type {
  EndUnit,
  EndValues,
  Reopen,
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  UnitLoopItem,
  UnitLayout,
  VariableValue,
  CoderUnitResponse,
  SessionResponse,
  AnyVariableType,
  EndItem,
  ReferenceScope,
  UnitData,
} from "@annotinder/contracts";
import { branchUnitsets, buildScope, loopDependencies, loopTitle, unitLoops, collectQuestions, fillRedirectUrl, fillUnitsetName, itemName, validateAnswer } from "@annotinder/contracts";
import type { BranchChoice, CoderApi } from "../api/httpCoderApi";
import { evaluateCondition } from "../codebook/conditions";
import { ExpressionCache } from "../codebook/expressionCache";
import { computeLoopSteps, computeTopLevelSteps, flattenTree, spanColumns, type StepContext } from "../codebook/tree";
import { renderTemplate, type RenderedTemplate } from "../codebook/renderTemplate";
import type { QuestionTexts } from "../components/Question";
import { QuestionTimer } from "./timing";

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
  type: "unit_loop" | "condition" | "question" | "end";
  label: string;
  isCurrent: boolean;
  isCompleted: boolean;
  unitCount?: number;
  /** Units this coder will get in the loop, if known (from the server). */
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
  /** The layout's template with its values evaluated for the current unit. */
  currentUnitTemplate: RenderedTemplate | null;
  /** The current question's texts with their values evaluated. */
  currentTexts: QuestionTexts | null;
  /**
   * The current (coder-level) question's answer can't change any more:
   * units were coded with it (contracts `loopDependencies`).
   */
  currentFrozen: boolean;
  userVariableValues: Record<string, VariableValue>;
  currentUnitVariables: Record<string, VariableValue> | null;
  error: string | null;
  /** Machine-readable error code from the server (e.g. `participant_has_session`), if any. */
  errorCode: string | null;
  /** With phase `finished`: the `end` item that ended the session, if one did. */
  ending: SessionEnding | null;
  /** With phase `finished`: the coder quit (`quit`). */
  quit: boolean;
  /** The coder asked for their answers to be deleted (`quit(true)`, also after the session ended). */
  deletionRequested: boolean;
  /** The email the coder is logged in with (their session is found by it on any device); null without. */
  login: string | null;
  /** The invitation lets the coder log in, and they haven't. */
  canLogIn: boolean;
  /** With phase `finished`: whether the coder can go back (`reopen()`); `until` null: always. */
  reopen: Reopen;
  /** Answers not saved on the server yet (they are sent in the background, `save`). */
  unsaved: number;
  /** Saving failed for lack of a connection (or a server hiccup): it is tried again. */
  retrying: boolean;
  navigation: JobManagerNavigation;
}

/** How the session ended at an `end` item: its message and redirect, with their values filled in. */
export interface SessionEnding {
  item: EndItem;
  message: RenderedTemplate | null;
  redirectUrl: string | null;
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
      else if (item.type !== "end") result.set(item.name, item.variable);
    }
  };
  walk(loop.children);
  return result;
}

/**
 * Answers that still fit the current codebook. Answers to questions that no
 * longer exist, or with codes the question no longer has, are left out, so
 * the coder is asked again (the server keeps answers to removed
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

/** The `end` item with this name (a session that ended on it); null if the codebook no longer has it. */
function findEnd(items: (TopLevelItem | InLoopItem)[], name: string): EndItem | null {
  for (const item of items) {
    if (item.type === "end" && item.name === name) return item;
    if ("children" in item) {
      const found = findEnd(item.children as (TopLevelItem | InLoopItem)[], name);
      if (found) return found;
    }
  }
  return null;
}

/** Answers waiting to be saved (`JobManager.save`). */
interface OutboxItem {
  /** What it saves: a newer item with the same key replaces one still waiting. */
  key: string;
  send: () => Promise<void>;
  /** A unit's answers, to put back after a new codebook version (`carryOver`). */
  unit?: { loop: string; unitId: number; answers: Record<string, VariableValue> };
}

/** Units fetched at once, and how few may be left before more are fetched (`fetchNextUnit`). */
const UNIT_BATCH = 5;
const UNIT_REFILL = 2;

/** A failure that may go away by itself: no connection, or the server or a proxy had a problem. Tried again. */
function isTransient(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch: network error
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && (status >= 500 || status === 408 || status === 429);
}

function errorCodeOf(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

function getQuestionLabel(item: CodebookItem): string {
  if ("variable" in item && item.variable && "question" in item.variable) {
    const q = item.variable.question;
    if (typeof q === "string" && q.trim().length > 0) return plainLabel(q) || (itemName(item) ?? "");
  }
  if (item.type === "unit_loop") return item.label?.trim() || "Unit loop";
  return itemName(item) ?? "";
}

/**
 * A question text's first line as a short plain label for the navigation
 * menu: without markdown marks, block fences, and with values and snippets
 * as "…" (they aren't filled in there).
 */
function plainLabel(text: string): string {
  const line = text.split("\n").find((l) => l.trim() && !/^\s*:{3,}/.test(l)) ?? "";
  return line
    .replace(/\{\{[\s\S]*?\}\}(::\w+)?|\$(unit|var)(\.\w+)+(::\w+)?|\[\[\w+\]\]/g, "…")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#+|>|[-*+]|\d+\.)\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

/**
 * Client-side runtime manager driving a single coder's interactive session
 * (docs/client.md §2), supporting full forwards/backwards navigation,
 * phase jumping, and editing previously submitted answers.
 */
export class JobManager {
  private items: TopLevelItem[] = [];
  /** Each unit loop's key (its position, contracts `unitLoops`): how the coder API and progress refer to it. */
  private loopKeys = new Map<UnitLoopItem, string>();
  /** Coder-level answers that can't change any more (`currentFrozen`). */
  private frozen = new Set<string>();
  /** Per loop key, the coder-level questions it depends on (frozen once a unit there is saved). */
  private dependencies = new Map<string, string[]>();
  private coderApi: CoderApi;
  private listeners: Set<JobManagerListener> = new Set();
  private expressionCache = new ExpressionCache();

  /** Every question in the codebook, for building `$var` scopes. */
  private questions = new Map<string, AnyVariableType>();
  private topSteps: CodebookItem[] = [];
  /** Answers of coder-level questions that are currently shown (hidden ones count as unanswered). */
  private coderVisible: Record<string, VariableValue> = {};
  /** The session's `$session` values (participant id, URL parameters its invite required). */
  private session: Record<string, string> = {};
  /** `coderVisible` plus the current unit's answers to questions that are currently shown. */
  private unitVisible: Record<string, VariableValue> = {};
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
  /** Set by `reopen`: resuming stops at the last question instead of the end. */
  private backFromEnd = false;

  private lastFailedOperation: (() => Promise<void>) | null = null;
  private starting: Promise<void> | null = null;
  /**
   * After a new codebook version: answers to units that weren't saved yet
   * (the unit the coder was working on, and finished units still waiting to
   * be saved), by `<loop>/<unitId>`: put back when the reloaded session
   * serves the unit again (`reloadAfterPublish`).
   */
  private carryOver = new Map<string, Record<string, VariableValue>>();
  /** Per loop key: units fetched ahead (a batch), not shown yet (`fetchNextUnit`). */
  private unitQueues = new Map<string, { units: CoderUnitResponse[]; filling: Promise<void> | null }>();
  /**
   * Answers still to be saved, in order: sent in the background, so the
   * coder never waits for the server (`save`). A unit's carries its answers,
   * to put them back after a new codebook version.
   */
  private outbox: OutboxItem[] = [];
  private draining: Promise<void> | null = null;
  /** Saving failed (not for lack of a connection): nothing more is sent until it is dealt with (`retry`, a reload). */
  private saveError: unknown = null;
  /** Operations running (`guarded`): a failed save is reported when they are done. */
  private busy = 0;
  private readonly timer: QuestionTimer;
  private readonly retryMs: (attempt: number) => number;

  private snapshot: JobManagerSnapshot = {
    phase: "loading",
    currentItem: null,
    currentUnit: null,
    currentUnitLayout: null,
    currentUnitTemplate: null,
    currentTexts: null,
    userVariableValues: {},
    currentUnitVariables: null,
    error: null,
    errorCode: null,
    ending: null,
    quit: false,
    deletionRequested: false,
    currentFrozen: false,
    login: null,
    canLogIn: false,
    reopen: null,
    unsaved: 0,
    retrying: false,
    navigation: {
      canGoBack: false,
      canGoForward: false,
      phases: [],
      currentPhaseIndex: 0,
      totalUnitsInHistory: 0,
      maxReachedTopIndex: 0,
    },
  };

  constructor(
    coderApi: CoderApi,
    options: {
      /** How long the coder takes per question (sent with the answers). */
      timer?: QuestionTimer;
      /** How long to wait before saving again after a failed attempt (the attempt counts from 1). */
      retryMs?: (attempt: number) => number;
    } = {},
  ) {
    this.coderApi = coderApi;
    this.timer = options.timer ?? new QuestionTimer();
    this.retryMs = options.retryMs ?? ((attempt) => Math.min(30_000, 1000 * 2 ** (attempt - 1)));
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
      const session: SessionResponse = await this.coderApi.getSession();
      this.items = session.codebook.items as TopLevelItem[];
      this.loopKeys = new Map(unitLoops(this.items).map(({ key, loop }) => [loop, key]));
      this.dependencies = loopDependencies(this.items);
      this.frozen = new Set(session.frozen ?? []);
      this.questions = collectQuestions(this.items).questions;
      // Coder-level variables so far, including server-assigned `auto`
      // variables (condition, slot, ...), so conditions can use them.
      for (const [name, value] of Object.entries(session.variables ?? {})) {
        this.userVariableValues[name] = value;
      }
      this.topIndex = -1;
      this.maxReachedTopIndex = 0;
      this.histories.clear();
      this.progress = new Map(session.progress.map((p) => [p.unitset, p]));
      this.session = session.session ?? {};
      if (session.deletionRequest) this.publish({ deletionRequested: true });
      this.publish({ login: session.login ?? null, canLogIn: session.canLogIn ?? false });
      if (session.ended) {
        // The coder reached an `end` item before, or quit: show the ending
        // again, with the values the server still gives for it (endValues).
        const item = session.ended.item ? findEnd(this.items, session.ended.item) : null;
        await this.refreshTopSteps();
        this.publish({ reopen: session.reopen ?? null });
        await this.publishEnding(item, this.endScope(session.endValues ?? null), session.ended.outcome === "quit");
        return;
      }
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

  /** A loop's key (`loopKeys`). */
  private keyOf(loop: UnitLoopItem): string {
    return this.loopKeys.get(loop) ?? "";
  }

  private history(loop: UnitLoopItem | null = this.activeLoop): LoopHistory {
    const name = loop ? this.keyOf(loop) : "";
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

  /** Makes a history entry the current unit, loading it from the server if needed. */
  private async openEntry(index: number): Promise<void> {
    const loop = this.activeLoop!;
    const entry = this.unitHistory[index];
    if (!entry.unit) {
      const unit = await this.coderApi.getLoopUnit(this.keyOf(loop), entry.unitId);
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
      if (currentItem && this.unitVariableValues[itemName(currentItem) ?? ""] !== undefined) return true;
    }
    if (this.unitHistoryIndex < this.unitHistory.length - 1) return true;
    if (this.topIndex < this.maxReachedTopIndex) return true;
    return false;
  }

  async goBack(): Promise<void> {
    await this.guarded(() => this.goBackNow());
  }

  /** `force`: also while loading (going back from the end, `reopen`). */
  private async goBackNow(force = false): Promise<void> {
    if (!force && !this.canGoBack()) return;

    this.syncCurrentUnitAnswers();

    // 1. Step backward within current unit's questions
    if (this.loopIndex > 0) {
      this.loopIndex -= 1;
      await this.publishLoopStep();
      return;
    }

    // 2. Step backward to previous unit in history
    if (this.unitHistoryIndex > 0 && this.activeLoop) {
      await this.openEntry(this.unitHistoryIndex - 1);
      await this.refreshLoopSteps();
      this.loopIndex = Math.max(0, this.loopSteps.length - 1);
      await this.publishLoopStep();
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
          await this.refreshLoopSteps();
          this.loopIndex = Math.max(0, this.loopSteps.length - 1);
          await this.publishLoopStep();
          return;
        }
      }

      this.activeLoop = null;
      this.currentUnit = null;
      await this.publishTopStep(prevTop);
    }
  }

  async goForward(allowFree = false): Promise<void> {
    await this.guarded(() => this.goForwardNow(allowFree));
  }

  private async goForwardNow(allowFree = false): Promise<void> {
    if (!this.canGoForward(allowFree)) return;

    this.syncCurrentUnitAnswers();

    // 1. Forward within questions of current unit
    if (this.loopIndex < this.loopSteps.length - 1) {
      this.loopIndex += 1;
      await this.publishLoopStep();
      return;
    }

    // 2. Forward to next unit in history
    if (this.unitHistoryIndex < this.unitHistory.length - 1 && this.activeLoop) {
      await this.openEntry(this.unitHistoryIndex + 1);
      await this.refreshLoopSteps();
      this.loopIndex = 0;
      await this.publishLoopStep();
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
        await this.publishTopStep(nextTop);
      }
    }
  }

  async jumpToUnit(unitIndex: number, allowFetchAhead = false): Promise<void> {
    await this.guarded(() => this.jumpToUnitNow(unitIndex, allowFetchAhead));
  }

  private async jumpToUnitNow(unitIndex: number, allowFetchAhead = false): Promise<void> {
    if (!this.activeLoop) return;
    this.syncCurrentUnitAnswers();

    // In preview mode with allowFetchAhead: fetch units ahead up to target unitIndex
    while (allowFetchAhead && this.unitHistory.length <= unitIndex) {
      const nextUnit = await this.fetchNextUnit(this.activeLoop);
      if (!nextUnit) break;
      // Back at the unit the coder had open before a new codebook version: keep their unsaved answers.
    const carried = this.takeCarryOver(this.activeLoop, nextUnit.id);
    this.unitHistory.push({ unitId: nextUnit.id, unit: nextUnit, answers: { ...carried, ...(nextUnit.variables ?? {}) } });
    }

    if (this.unitHistory.length === 0) return;
    const target = Math.max(0, Math.min(unitIndex, this.unitHistory.length - 1));

    await this.openEntry(target);
    await this.refreshLoopSteps();
    this.loopIndex = 0;
    await this.publishLoopStep();
  }

  async jumpToLoopStep(stepIndex: number, allowAhead = false): Promise<void> {
    if (!this.activeLoop || !this.currentUnit || stepIndex < 0 || stepIndex >= this.loopSteps.length) return;
    if (!allowAhead) {
      const hasUnansweredEarlier = this.loopSteps
        .slice(0, stepIndex)
        .some((q) => this.unitVariableValues[itemName(q) ?? ""] === undefined);
      if (hasUnansweredEarlier && stepIndex > this.loopIndex) return;
    }
    this.syncCurrentUnitAnswers();
    this.loopIndex = stepIndex;
    await this.publishLoopStep();
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
    await this.guarded(() => this.jumpToPhaseNow(phaseIndex, allowAhead));
  }

  private async jumpToPhaseNow(phaseIndex: number, allowAhead = false): Promise<void> {
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
        await this.refreshLoopSteps();
        this.loopIndex = 0;
        await this.publishLoopStep();
      } else {
        this.currentUnit = null;
        this.loopIndex = -1;
        await this.advanceUnit();
      }
    } else {
      this.activeLoop = null;
      this.currentUnit = null;
      await this.publishTopStep(target);
    }
  }

  async answer(value: VariableValue): Promise<void> {
    const item = this.snapshot.currentItem;
    if (!item || item.type !== "question") return;
    await this.guarded(async () => {
      const answers = this.activeLoop === null ? this.userVariableValues : this.unitVariableValues;
      const key = this.timingKey(item.name);
      if (key) this.timer.answered(key, JSON.stringify(answers[item.name]) !== JSON.stringify(value));
      this.timer.leave();
      if (this.activeLoop === null) {
        // A frozen answer stays as it is (the server ignores another one).
        if (!this.frozen.has(item.name)) this.userVariableValues[item.name] = value;
        const values = await this.postedCoderValues();
        const timings = this.timer.take("c:");
        this.save({ key: "coder", send: () => this.coderApi.postCoderVariables(values, timings) });
        await this.advanceTop();
      } else {
        this.unitVariableValues[item.name] = value;
        await this.advanceUnit();
      }
    });
  }

  /** The timer's key for a question on screen now (`QuestionTimer`): coder-level, or in the current unit. */
  private timingKey(name: string): string | null {
    if (this.activeLoop === null) return `c:${name}`;
    return this.currentUnit ? `u:${this.currentUnit.id}:${name}` : null;
  }

  /**
   * Saves in the background: the coder goes on at once. Posts go out one at
   * a time, in order; a newer one for the same answers (`OutboxItem.key`)
   * replaces one still waiting. A failure for lack of a connection (or a
   * server hiccup) is tried again, later and later; another failure stops
   * saving until it is dealt with (`reportSaveError`).
   */
  private save(item: OutboxItem): void {
    const waiting = this.outbox.findIndex((other, i) => other.key === item.key && !(i === 0 && this.draining));
    if (waiting >= 0) this.outbox[waiting] = item;
    else this.outbox.push(item);
    this.publish({ unsaved: this.outbox.length });
    if (this.saveError === null) this.drain().catch(() => this.reportSaveError());
  }

  /** Waits until everything is saved (e.g. before the session ends); throws if saving failed. */
  private async flush(): Promise<void> {
    while (this.outbox.length > 0) await this.drain();
  }

  private drain(): Promise<void> {
    if (this.saveError !== null) return Promise.reject(this.saveError);
    this.draining ??= (async () => {
      let attempt = 0;
      try {
        while (this.outbox.length > 0) {
          try {
            await this.outbox[0].send();
            this.outbox.shift();
            attempt = 0;
            this.publish({ unsaved: this.outbox.length, retrying: false });
          } catch (err) {
            if (!isTransient(err)) {
              this.saveError = err;
              throw err;
            }
            attempt += 1;
            this.publish({ retrying: true });
            await new Promise((resolve) => setTimeout(resolve, this.retryMs(attempt)));
          }
        }
      } finally {
        this.draining = null;
      }
    })();
    return this.draining;
  }

  /**
   * Saving failed in the background. While the coder's last action is still
   * being handled, that action meets the error itself (`guarded`).
   * Otherwise: a new codebook version loads the session again
   * (`reloadAfterPublish`; unsaved answers to units are put back when those
   * come again); another error shows, and `retry()` saves again.
   */
  private reportSaveError(): void {
    const err = this.saveError;
    if (err === null || this.busy > 0 || this.snapshot.phase === "error") return;
    if (errorCodeOf(err) === "codebook_changed") {
      void this.guarded(() => this.reloadAfterPublish());
      return;
    }
    this.lastFailedOperation = async () => {
      await this.flush();
      await this.republish();
    };
    this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err), errorCode: errorCodeOf(err), retrying: false });
  }

  /** Shows the current question again (after an error). */
  private async republish(): Promise<void> {
    if (this.activeLoop && this.currentUnit) await this.publishLoopStep();
    else if (!this.activeLoop && this.topSteps[this.topIndex]?.type === "question") await this.publishTopStep(this.topSteps[this.topIndex]);
  }

  /**
   * Runs an operation that talks to the server (answering, navigating). A
   * failure shows as an error that `retry()` repeats; a new codebook version
   * (`codebook_changed`) loads the session again.
   */
  private async guarded(operation: () => Promise<void>): Promise<void> {
    this.lastFailedOperation = operation;
    this.busy += 1;
    try {
      await operation();
      // (An operation that handles its own failure, like start(), sets its own retry.)
      if (this.lastFailedOperation === operation) this.lastFailedOperation = null;
    } catch (err) {
      if (errorCodeOf(err) === "codebook_changed") {
        this.lastFailedOperation = null;
        await this.reloadAfterPublish();
        return;
      }
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err), errorCode: errorCodeOf(err) });
    } finally {
      this.busy -= 1;
    }
    // A save that failed in the background meanwhile
    this.reportSaveError();
  }

  /**
   * A new codebook version was published while the coder was working (the
   * server answered `codebook_changed`): load the session again, as after a
   * reload, so the coder continues where they were under the new version.
   * Answers to units that weren't saved yet are kept, if they still fit;
   * coder-level answers not saved yet are asked again.
   */
  private async reloadAfterPublish(): Promise<void> {
    // Unsaved answers to units come back with their units; unsaved coder-level answers are asked again.
    for (const { unit } of this.outbox) if (unit) this.carryOver.set(`${unit.loop}/${unit.unitId}`, unit.answers);
    this.outbox = [];
    this.saveError = null;
    if (this.activeLoop && this.currentUnit) this.carryOver.set(`${this.keyOf(this.activeLoop)}/${this.currentUnit.id}`, { ...this.unitVariableValues });
    this.unitQueues.clear();
    this.publish({ unsaved: 0, retrying: false });
    this.starting = null;
    this.userVariableValues = {};
    this.unitVariableValues = {};
    this.activeLoop = null;
    this.currentUnit = null;
    this.expressionCache = new ExpressionCache();
    await this.start();
  }

  async submitAnswer(value: VariableValue): Promise<void> {
    return this.answer(value);
  }

  async retry(): Promise<void> {
    const op = this.lastFailedOperation;
    if (!op) return;
    // Saving is tried again too.
    this.saveError = null;
    await this.guarded(op);
  }

  private syncCurrentUnitAnswers(): void {
    if (this.currentUnit && this.unitHistoryIndex >= 0 && this.unitHistoryIndex < this.unitHistory.length) {
      this.unitHistory[this.unitHistoryIndex].answers = { ...this.unitVariableValues };
    }
  }

  private get stepContext(): StepContext {
    return { questions: this.questions, cache: this.expressionCache, session: this.session };
  }

  /** The scope for scripts and templates: answers, the unit's data, and the session's values. */
  private scope(answers: Record<string, VariableValue>, unit?: UnitData | null): ReferenceScope {
    return buildScope(this.questions, answers, unit, this.session);
  }

  private async refreshTopSteps(): Promise<void> {
    const { steps, visible } = await computeTopLevelSteps(this.items, this.userVariableValues, this.stepContext);
    this.topSteps = steps;
    this.coderVisible = visible;
  }

  private async refreshLoopSteps(): Promise<void> {
    if (!this.activeLoop || !this.currentUnit) return;
    const { steps, visible } = await computeLoopSteps(
      this.activeLoop,
      this.coderVisible,
      this.unitVariableValues,
      this.currentUnit.data,
      this.stepContext,
    );
    this.loopSteps = steps;
    this.unitVisible = visible;
  }

  /** A question's texts with their values filled in (in a loop, its snippets too). */
  private async questionTexts(
    item: CodebookItem | undefined,
    scope: ReferenceScope,
    snippets?: Record<string, string>,
  ): Promise<QuestionTexts | null> {
    if (!item || !("variable" in item) || !("question" in item.variable)) return null;
    const { question, instruction } = item.variable;
    const [q, i] = await Promise.all([
      question ? renderTemplate(question, scope, this.expressionCache, `question:${item.name}`, { snippets }) : undefined,
      instruction ? renderTemplate(instruction, scope, this.expressionCache, `instruction:${item.name}`, { snippets }) : undefined,
    ]);
    return { question: q, instruction: i };
  }

  /** Publishes the current step of the current unit, with the layout and texts rendered. */
  private async publishLoopStep(): Promise<void> {
    const loop = this.activeLoop;
    const unit = this.currentUnit;
    if (!loop || !unit) return;
    const step = this.loopSteps[this.loopIndex];
    try {
      const scope = this.scope(this.unitVisible, unit.data);
      const snippets = loop.layout.snippets;
      const [template, texts] = await Promise.all([
        renderTemplate(loop.layout.template, scope, this.expressionCache, `layout:${this.keyOf(loop)}`, {
          progress: { current: step && "name" in step ? step.name : null, order: loopQuestionNames(loop) },
          snippets,
          selectable: spanColumns(loop),
        }),
        this.questionTexts(step, scope, snippets),
      ]);
      this.publish({
        phase: "unit_variable",
        currentItem: step,
        currentUnit: unit,
        currentUnitLayout: loop.layout,
        currentUnitTemplate: template,
        currentTexts: texts,
        currentUnitVariables: { ...this.unitVariableValues },
        currentFrozen: false,
      });
    } catch (err) {
      this.publish({ phase: "error", error: err instanceof Error ? err.message : String(err), errorCode: errorCodeOf(err) });
    }
  }

  /** Publishes a top-level (coder-level) question. */
  private async publishTopStep(item: CodebookItem): Promise<void> {
    this.publish({
      phase: "user_variable",
      currentItem: item,
      currentUnit: null,
      currentUnitLayout: null,
      currentUnitTemplate: null,
      currentTexts: await this.questionTexts(item, this.scope(this.coderVisible)),
      currentUnitVariables: null,
      currentFrozen: "name" in item && this.frozen.has(item.name),
    });
  }

  /**
   * The branch of a loop's `units` for this coder: the first whose `when`
   * holds, with its unitset names filled in; null if none matches.
   * Evaluated here rather than on the server, so the server never
   * needs the answers (docs/architecture.md §6).
   */
  private async chooseBranch(loop: UnitLoopItem): Promise<BranchChoice | null> {
    const scope = this.scope(this.coderVisible);
    for (const [i, branch] of loop.units.entries()) {
      if (branch.when && !(await evaluateCondition(branch.when, scope, this.expressionCache, `branch:${this.keyOf(loop)}:${i}`))) {
        continue;
      }
      // The server picks the set where the template is null (`sets` and `invitation` mode): sent as "".
      const templates = branchUnitsets(branch);
      const unitsets = templates.map((t) => (t === null ? "" : fillUnitsetName(t, scope)));
      const missing = templates.find((t, s) => t !== null && unitsets[s] === null);
      if (missing) {
        throw new Error(`${loopTitle(loop, this.keyOf(loop))}: no unitset '${missing}' for this coder (an answer it uses is missing)`);
      }
      return { branch: i, unitsets: unitsets as string[] };
    }
    return null;
  }

  /**
   * The next unit of a loop from the server, telling it the chosen
   * branch (ignored once the coder is routed: routing is sticky). If no
   * branch matches and the coder wasn't routed before, the coder has no
   * units in this loop.
   */
  /**
   * The coder's next unit in a loop, or null when they are done with it.
   * Units come in batches (`UNIT_BATCH`), fetched again in the background
   * before the batch runs out, so the coder doesn't wait.
   */
  private async fetchNextUnit(loop: UnitLoopItem): Promise<CoderUnitResponse | null> {
    const queue = this.unitQueue(loop);
    if (queue.units.length === 0) await this.fillQueue(loop);
    // Units answered but not saved yet came back (the server doesn't know
    // they are done): once saved, it knows what is next.
    if (queue.units.length === 0 && this.outbox.some((item) => item.unit?.loop === this.keyOf(loop))) {
      await this.flush();
      await this.fillQueue(loop);
    }
    const unit = queue.units.shift() ?? null;
    if (unit && queue.units.length < UNIT_REFILL) this.fillQueue(loop).catch(() => {}); // tried again when needed
    return unit;
  }

  private unitQueue(loop: UnitLoopItem): { units: CoderUnitResponse[]; filling: Promise<void> | null } {
    const key = this.keyOf(loop);
    let queue = this.unitQueues.get(key);
    if (!queue) this.unitQueues.set(key, (queue = { units: [], filling: null }));
    return queue;
  }

  /** Asks the server for the coder's next units; adds those the coder doesn't have yet. */
  private fillQueue(loop: UnitLoopItem): Promise<void> {
    const queue = this.unitQueue(loop);
    queue.filling ??= (async () => {
      try {
        const choice = await this.chooseBranch(loop);
        let units: CoderUnitResponse[];
        try {
          units = await this.coderApi.getNextUnits(this.keyOf(loop), choice ?? undefined, UNIT_BATCH);
        } catch (err) {
          if (choice === null && errorCodeOf(err) === "branch_required") return;
          throw err;
        }
        const known = new Set([...this.history(loop).entries.map((e) => e.unitId), ...queue.units.map((u) => u.id)]);
        queue.units.push(...units.filter((u) => !known.has(u.id)));
      } finally {
        queue.filling = null;
      }
    })();
    return queue.filling;
  }

  /** Answers to a unit kept over a new codebook version (`carryOver`), once. */
  private takeCarryOver(loop: UnitLoopItem, unitId: number): Record<string, VariableValue> {
    const key = `${this.keyOf(loop)}/${unitId}`;
    const answers = this.carryOver.get(key) ?? {};
    this.carryOver.delete(key);
    return answers;
  }

  /**
   * The coder reached an `end` item (inside a unit loop: on `unit`), or
   * without one the end of the job: tells the server, and shows the ending.
   */
  private async reachEnd(item: EndItem | null, scope: ReferenceScope, unit?: EndUnit): Promise<void> {
    // Everything is saved before the session ends (the server accepts nothing after).
    await this.flush();
    const ended = await this.coderApi.endSession(item?.name, unit);
    this.publish({ reopen: ended?.reopen ?? null });
    await this.publishEnding(item, scope);
  }

  /**
   * The values an ending is shown with again, after a reload: the coder's,
   * and for an end inside a unit loop also the unit's data and answers (as
   * when it was reached). Without the unit (e.g. no longer in the job), the
   * coder's only.
   */
  private endScope(values: EndValues | null): ReferenceScope {
    if (!values) return this.scope(this.coderVisible);
    return this.scope({ ...this.coderVisible, ...values.variables, ...values.unit?.variables }, values.unit?.data as UnitData | undefined);
  }

  /**
   * Goes back after finishing (while `reopen` allows): the server opens the
   * session again, and the coder lands on their last question.
   */
  async reopen(): Promise<void> {
    await this.guarded(async () => {
      await this.coderApi.reopenSession();
      this.backFromEnd = true;
      this.starting = null;
      await this.start();
    });
  }

  /**
   * The coder quits: the session ends for good (answers given so far are
   * kept); with `requestDeletion` they ask the researcher to delete their
   * answers, which also works after the session ended. Answers to a unit
   * that weren't saved yet are dropped.
   */
  async quit(requestDeletion: boolean): Promise<void> {
    await this.guarded(async () => {
      await this.flush();
      await this.coderApi.quitSession(requestDeletion);
      if (requestDeletion) this.publish({ deletionRequested: true });
      if (this.snapshot.phase !== "finished") await this.publishEnding(null, this.scope(this.coderVisible), true);
    });
  }

  /** Publishes the finished phase; with an `end` item, its message and redirect. */
  private async publishEnding(item: EndItem | null, scope: ReferenceScope, quit = false): Promise<void> {
    const ending: SessionEnding | null = item && {
      item,
      message: item.message ? await renderTemplate(item.message, scope, this.expressionCache, `end:${item.name}`) : null,
      redirectUrl: item.redirectUrl ? fillRedirectUrl(item.redirectUrl, scope) : null,
    };
    this.activeLoop = null;
    this.currentUnit = null;
    this.publish({
      phase: "finished",
      currentItem: null,
      currentUnit: null,
      currentUnitLayout: null,
      currentUnitTemplate: null,
      currentTexts: null,
      currentUnitVariables: null,
      ending,
      quit,
    });
  }

  private async advanceTop(): Promise<void> {
    await this.refreshTopSteps();
    this.topIndex += 1;
    this.maxReachedTopIndex = Math.max(this.maxReachedTopIndex, this.topIndex);
    const next = this.topSteps[this.topIndex];

    // Back from the end (`reopen`): the last question instead of ending again.
    if (this.backFromEnd && (!next || next.type === "end")) {
      this.backFromEnd = false;
      this.resuming = false;
      await this.goBackNow(true);
      return;
    }

    if (!next) {
      await this.reachEnd(null, this.scope(this.coderVisible));
      return;
    }

    if (next.type === "end") {
      await this.reachEnd(next, this.scope(this.coderVisible));
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
    await this.publishTopStep(next);
  }

  /**
   * The coder-level answers to store: an answer to a question a condition
   * now hides (an earlier answer changed) is stored as `skip`, as in loops.
   * The answer itself stays here, should the question show again.
   */
  private async postedCoderValues(): Promise<Record<string, VariableValue>> {
    const { visible } = await computeTopLevelSteps(this.items, this.userVariableValues, this.stepContext);
    return Object.fromEntries(Object.entries(this.userVariableValues).map(([name, value]) => [name, name in visible ? value : { done: true, skip: true }]));
  }

  private async advanceUnit(): Promise<void> {
    if (!this.activeLoop) return;

    // Advance loop question step within the current unit
    if (this.currentUnit) {
      await this.refreshLoopSteps();
      this.loopIndex += 1;
      const next = this.loopSteps[this.loopIndex];
      if (next && next.type !== "end") {
        await this.publishLoopStep();
        return;
      }

      // No more steps: the unit is finished. Post an answer for every
      // question of the loop -- `skip` for those a condition hid -- since the
      // server only accepts complete units (docs/architecture.md §8.2).
      // An answer to a question that is now hidden (an earlier answer
      // changed) is posted as `skip` too.
      const doneValues: Record<string, VariableValue> = {};
      for (const name of loopVariables(this.activeLoop).keys()) {
        const value = this.unitVisible[name];
        doneValues[name] = value ? { ...value, done: true } : { done: true, skip: true };
      }
      const { id } = this.currentUnit;
      const loopKey = this.keyOf(this.activeLoop);
      const timings = this.timer.take(`u:${id}:`);
      this.save({
        key: `unit:${loopKey}/${id}`,
        send: () => this.coderApi.postUnitVariables(id, doneValues, loopKey, timings),
        unit: { loop: loopKey, unitId: id, answers: doneValues },
      });
      for (const name of this.dependencies.get(loopKey) ?? []) if (name in this.userVariableValues) this.frozen.add(name);
      if (this.currentUnit && this.unitHistoryIndex >= 0 && this.unitHistoryIndex < this.unitHistory.length) {
        this.unitHistory[this.unitHistoryIndex].answers = { ...doneValues };
      }
      // An `end` item in the loop: the unit is saved, then the session ends.
      if (next?.type === "end") {
        const scope = this.scope(this.unitVisible, this.currentUnit.data);
        await this.reachEnd(next, scope, { loop: this.keyOf(this.activeLoop), id: this.currentUnit.id });
        return;
      }

      // If reviewing an earlier unit in history, advance to the next unit in history
      if (this.unitHistoryIndex < this.unitHistory.length - 1) {
        await this.openEntry(this.unitHistoryIndex + 1);
        await this.refreshLoopSteps();
        this.loopIndex = 0;
        const firstStep = this.loopSteps[0];
        if (firstStep) {
          await this.publishLoopStep();
          return;
        }
      }

      this.unitVariableValues = {};
      this.currentUnit = null;
    }

    // At frontier: ask the server for the next unit of this loop.
    const nextUnit = await this.fetchNextUnit(this.activeLoop);
    if (!nextUnit) {
      // Loop finished: advance to the next top-level item.
      this.activeLoop = null;
      await this.advanceTop();
      return;
    }

    // Back at the unit the coder had open before a new codebook version: keep their unsaved answers.
    const carried = this.takeCarryOver(this.activeLoop, nextUnit.id);
    this.unitHistory.push({ unitId: nextUnit.id, unit: nextUnit, answers: { ...carried, ...(nextUnit.variables ?? {}) } });
    await this.openEntry(this.unitHistory.length - 1);

    await this.refreshLoopSteps();
    // Start at the first question without a (still valid) answer: the unit
    // may be partly done (reload mid-unit, or the codebook gained a question).
    const firstOpen = this.loopSteps.findIndex((step) => this.unitVariableValues[itemName(step) ?? ""] === undefined);
    this.loopIndex = firstOpen === -1 ? Math.max(0, this.loopSteps.length - 1) : firstOpen;
    const firstStep = this.loopSteps[this.loopIndex];
    if (!firstStep) {
      // Degenerate loop with no steps: immediately move past it.
      await this.advanceUnit();
      return;
    }

    this.resuming = false;
    await this.publishLoopStep();
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
        totalUnits = this.progress.get(this.keyOf(step))?.totalUnits ?? undefined;
        if (isCurrent && this.activeLoop) {
          currentUnitIndex = history.index >= 0 ? history.index : 0;
          units = history.entries.map((h, hIdx) => ({
            index: hIdx,
            id: h.unitId,
            externalId: h.unit?.externalId ?? `#${h.unitId}`,
            isCurrent: hIdx === history.index,
          }));

          // The questions this unit shows (conditions applied), numbered as the coder meets them.
          questions = this.loopSteps.flatMap((q, qIdx) =>
            q.type === "question"
              ? [{ index: qIdx, name: q.name, label: getQuestionLabel(q), isCurrent: qIdx === this.loopIndex, isCompleted: qIdx < this.loopIndex }]
              : [],
          );
        }
      }

      return {
        index: idx,
        name: step.type === "unit_loop" ? this.keyOf(step) : (itemName(step) ?? ""),
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
    // The question on screen is timed while it is there
    const { phase, currentItem, currentUnit } = this.snapshot;
    const name = currentItem && itemName(currentItem);
    if (phase === "user_variable" && name) this.timer.show(`c:${name}`);
    else if (phase === "unit_variable" && name && currentUnit) this.timer.show(`u:${currentUnit.id}:${name}`);
    else this.timer.leave();
    for (const listener of this.listeners) listener();
  }
}

/** A loop's questions in codebook order (through conditions), for `::: from` blocks in its layout. */
function loopQuestionNames(loop: UnitLoopItem): string[] {
  return flattenTree(loop.children).flatMap((item) => (item.type === "condition" ? [] : (itemName(item) ?? [])));
}
