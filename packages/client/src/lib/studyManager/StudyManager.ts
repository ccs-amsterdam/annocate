import type {
  EndUnit,
  EndValues,
  DesignItem,
  TopLevelItem,
  CoderTopLevelItem,
  SubmitUnitResponse,
  CoderUnitLoopItem,
  VariableValue,
  CoderUnitResponse,
  SessionResponse,
  AnyVariableType,
  EndItem,
  ReferenceScope,
  UnitData,
  LayoutItem,
} from "@annotinder/contracts";
import {
  answerMatchesKey,
  parseAnswerKey,
  buildScope,
  unitScopeData,
  loopDependencies,
  unitLoops,
  collectQuestions,
  fillRedirectUrl,
  itemName,
  loopLayouts,
  loopSnippets,
  validateAnswer,
} from "@annotinder/contracts";
import type { CoderApi } from "../api/httpCoderApi";
import { ExpressionCache } from "../codebook/expressionCache";
import { computeLoopSteps, computeTopLevelSteps, spanColumns, type StepContext } from "../codebook/tree";
import { renderTemplate, staticTemplate } from "../codebook/renderTemplate";
import type { QuestionTexts } from "../components/Question";
import { QuestionTimer } from "./timing";
import { errorCodeOf, errorFields, isRefusal, isTransient } from "./errors";
import { currentAnswers, findEnd, loopQuestionNames, loopVariables } from "./items";
import { stepLabel } from "./navigationLabels";
import { Outbox, UnsentUnits, type OutboxItem, type UnitPost } from "./outbox";
import { expectedAnswerText } from "./practice";
import { UnitDraftStore } from "./unitDraft";
import type {
  NavigationPhase,
  NavigationUnitItem,
  NavigationUnitQuestion,
  SessionEnding,
  StudyManagerListener,
  StudyManagerNavigation,
  StudyManagerSnapshot,
} from "./types";

/**
 * A unit in a loop's history. Units finished in an earlier visit (resumed
 * session) start as just an id; content and answers are loaded when the
 * coder navigates to them.
 */
interface UnitHistoryEntry {
  unitId: number;
  unit: CoderUnitResponse | null;
  answers: Record<string, VariableValue> | null;
  /** The coder finished the unit (its answers were sent), now or in an earlier visit. */
  done: boolean;
}

interface LoopHistory {
  entries: UnitHistoryEntry[];
  index: number;
}

/**
 * Where the coder is: what a failed operation puts back (`runGuarded`), so
 * that the coder is on the step they see and `retry()` starts from there.
 */
interface Position {
  topSteps: DesignItem[];
  topIndex: number;
  reachedTopSteps: Set<string>;
  coderVisible: Record<string, VariableValue>;
  activeLoop: CoderUnitLoopItem | null;
  currentUnit: CoderUnitResponse | null;
  loopSteps: DesignItem[];
  loopStepLayouts: (LayoutItem | null)[];
  loopIndex: number;
  unitVariableValues: Record<string, VariableValue>;
  unitVisible: Record<string, VariableValue>;
  /** Per loop key, the unit of its history the coder is on. */
  historyIndexes: Map<string, number>;
}

/** Units fetched at once, and how few may be left before more are fetched (`fetchNextUnit`). */
const UNIT_BATCH = 5;
const UNIT_REFILL = 2;

const INITIAL_SNAPSHOT: StudyManagerSnapshot = {
  phase: "loading",
  currentItem: null,
  currentUnit: null,
  currentUnitLayout: null,
  currentLoopVariables: null,
  currentUnitTemplate: null,
  currentTexts: null,
  userVariableValues: {},
  currentUnitVariables: null,
  error: null,
  errorCode: null,
  refusedUnit: null,
  ending: null,
  quit: false,
  deletionRequested: false,
  currentFrozen: false,
  login: null,
  canLogIn: false,
  reopen: null,
  newUnits: null,
  unsaved: 0,
  unsavedUnits: 0,
  retrying: false,
  practiceWrong: null,
  practiceRight: 0,
  title: null,
  display: {},
  navigation: {
    canGoBack: false,
    canGoForward: false,
    phases: [],
    currentPhaseIndex: 0,
    totalUnitsInHistory: 0,
    maxReachedTopIndex: 0,
  },
};

/**
 * Drives one coder's session (docs/client.md §2 "StudyManager"): which step
 * is shown, back and forward navigation, jumps, editing earlier answers, and
 * saving answers in the background. Framework-agnostic; `useStudyManager`
 * binds it to React.
 */
export class StudyManager {
  private readonly coderApi: CoderApi;
  private readonly listeners: Set<StudyManagerListener> = new Set();
  private readonly timer: QuestionTimer;
  private readonly outbox: Outbox;
  private readonly drafts = new UnitDraftStore();
  private readonly unsent = new UnsentUnits();
  private expressionCache = new ExpressionCache();
  private snapshot: StudyManagerSnapshot = INITIAL_SNAPSHOT;

  // --- The codebook (set when the session loads) ---

  /** The coder codebook (contracts `CoderCodebook`): only what coding needs. */
  private items: CoderTopLevelItem[] = [];
  /** Each unit loop's key (its id, contracts `unitLoops`): how the coder API and progress refer to it. */
  private loopKeys = new Map<CoderUnitLoopItem, string>();
  /** Every question in the codebook, for building `$var` scopes. */
  private questions = new Map<string, AnyVariableType>();
  /** The coder-level ones (experiments too): what a coder-level answer can be for. */
  private coderQuestions = new Map<string, AnyVariableType>();
  /** Per loop key, the coder-level questions it depends on (frozen once a unit there is saved). */
  private dependencies = new Map<string, string[]>();
  /** The session's `$session` values (the coder id, the design's URL parameters). */
  private session: Record<string, string> = {};

  // --- Where the coder is ---

  private topSteps: DesignItem[] = [];
  private topIndex = -1;
  /**
   * The top-level steps the coder got to (`topStepKey`), and the last of
   * them in `topSteps`: how far Next goes. Kept by step, not by index: a
   * changed answer can hide steps before it.
   */
  private reachedTopSteps = new Set<string>();
  private maxReachedTopIndex = 0;
  private activeLoop: CoderUnitLoopItem | null = null;
  private currentUnit: CoderUnitResponse | null = null;
  private loopSteps: DesignItem[] = [];
  /** The layout each loop step shows the unit with (the last layout item passed; null: no unit). */
  private loopStepLayouts: (LayoutItem | null)[] = [];
  private loopIndex = -1;
  /** Per unit_loop: the units seen in this session (plus, after a resume, those finished earlier). */
  private histories = new Map<string, LoopHistory>();
  /** Per unit_loop: finished unit ids and expected total, from the session. */
  private progress = new Map<string, { doneUnitIds: number[]; totalUnits?: number | null }>();

  // --- Answers ---

  private userVariableValues: Record<string, VariableValue> = {};
  private unitVariableValues: Record<string, VariableValue> = {};
  /** Answers of coder-level questions that are currently shown (hidden ones count as unanswered). */
  private coderVisible: Record<string, VariableValue> = {};
  /** `coderVisible` plus the current unit's answers to questions that are currently shown. */
  private unitVisible: Record<string, VariableValue> = {};
  /** Coder-level answers that can't change any more (`currentFrozen`). */
  private frozen = new Set<string>();
  /**
   * After a new design version: answers to units that weren't saved yet
   * (units the coder started and didn't finish, and finished units still in
   * the outbox), by `<loop>/<unitId>`, put back when the reloaded session
   * has the unit again (`reloadAfterPublish`).
   */
  private carryOver = new Map<string, Record<string, VariableValue>>();

  // --- Practice units (docs/architecture.md §6.2) ---

  /** Tries per practice question until right, by unit id and question (stored with the answer's timing). */
  private practiceTries = new Map<number, Map<string, number>>();
  /** Practice questions answered right (or gone on from), by `<unitId>:<question>`: checked once. */
  private solvedPractice = new Set<string>();
  /** Practice questions whose answer so far is wrong, by `<unitId>:<question>`: not answered yet (`isAnswered`). */
  private wrongPractice = new Set<string>();
  /** The unit a loop question first came up on (its instruction opens by itself there with `instructionOpen: "first"`). */
  private instructionShownOn = new Map<string, number>();

  // --- Session lifecycle ---

  private starting: Promise<void> | null = null;
  /** True while restoring a resumed session: answered questions are skipped until one needs input. */
  private resuming = false;
  /** Set by `reopen`: resuming stops at the last question instead of the end. */
  private backFromEnd = false;
  /** The unit an `end` inside a loop was reached on: reopening goes back to it. */
  private endedOn: EndUnit | null = null;
  /** The server ended the session (`endedByServer`): nothing more is saved or shown. */
  private serverEnded = false;

  // --- Operations (`guarded`) ---

  /** The end of the line of operations: each starts when the one before is done. */
  private turn: Promise<void> = Promise.resolve();
  /** Operations running: a failed background save is reported when they are done. */
  private busy = 0;
  /** What `retry()` repeats: set when an operation failed, until it is retried. */
  private lastFailedOperation: (() => Promise<void>) | null = null;
  /** What fails with the operation now running: all of it, or its part still to do (`retryFrom`). */
  private failing: () => Promise<void> = async () => {};
  /** The phase the error replaced: shown again when `retry()` starts. */
  private phaseBeforeError: StudyManagerSnapshot["phase"] = "loading";
  /**
   * Per loop key: units fetched ahead (a batch), not shown yet
   * (`fetchNextUnit`), and every unit the queue ever held (`seen`): the server
   * lists unfinished units first, so a unit handed out but not finished yet
   * comes back in the next batch and must not be queued again.
   */
  private unitQueues = new Map<
    string,
    { units: CoderUnitResponse[]; filling: Promise<void> | null; seen: Set<number> }
  >();

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
    this.outbox = new Outbox(
      options.retryMs ?? ((attempt) => Math.min(30_000, 1000 * 2 ** (attempt - 1))),
      (state) => this.publish(state),
      () => this.reportSaveError(),
      this.unsent,
    );
  }

  getSnapshot(): StudyManagerSnapshot {
    return this.snapshot;
  }

  subscribe(listener: StudyManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Loads the session and moves to where the coder left off. Idempotent:
   * calling it again while (or after) it runs reuses the same start, so
   * React StrictMode's double effects don't interleave two starts. After
   * `dispose()` it goes on where the manager was.
   */
  start(): Promise<void> {
    this.timer.listen();
    this.outbox.resume();
    return this.load();
  }

  /**
   * The coding screen is gone: stops following the page (response times) and
   * saving in the background. Finished units still to be sent stay in the
   * browser, and are sent on the next visit.
   */
  dispose(): void {
    this.timer.dispose();
    this.outbox.dispose();
  }

  /** Loads the session, unless that is underway or done (`start`). */
  private load(): Promise<void> {
    this.starting ??= this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<void> {
    try {
      this.publish({ phase: "loading", error: null, errorCode: null });
      let session: SessionResponse = await this.coderApi.getSession();
      this.drafts.sessionId = this.unsent.sessionId = session.sessionId;
      // With the units an earlier visit left unsent, the session is another one: finished units, what is next
      if (await this.sendUnsentUnits()) session = await this.coderApi.getSession();
      this.items = session.codebook.items;
      this.publish({ title: session.codebook.title ?? null, display: session.codebook.display ?? {} });
      this.loopKeys = new Map(unitLoops(this.items).map(({ key, loop }) => [loop, key]));
      this.dependencies = loopDependencies(this.items);
      this.frozen = new Set(session.frozen ?? []);
      const { questions, loopOf } = collectQuestions(this.items);
      this.questions = questions;
      this.coderQuestions = new Map([...questions].filter(([name]) => loopOf.get(name) === null));
      // The coder-level answers so far (drawn conditions included), so conditions can use them
      for (const [name, value] of Object.entries(session.variables ?? {})) {
        this.userVariableValues[name] = value;
      }
      this.topIndex = -1;
      this.reachedTopSteps.clear();
      this.maxReachedTopIndex = 0;
      // (A start that failed halfway may have entered a loop)
      this.leaveLoop();
      this.histories.clear();
      this.progress = new Map(session.progress.map((p) => [p.set, p]));
      this.session = session.session ?? {};
      if (session.deletionRequest) this.publish({ deletionRequested: true });
      this.publish({ login: session.login ?? null, canLogIn: session.canLogIn ?? false });
      // Told once (the server doesn't repeat it): kept until dismissed
      if (session.newUnits) this.publish({ newUnits: session.newUnits.message });
      if (session.ended) {
        this.endedOn = session.ended.unit ?? null;
        // The coder reached an `end` item before, or quit: show the ending
        // again, with the values the server still gives for it (endValues).
        const item = session.ended.item ? findEnd(this.stepItems, session.ended.item) : null;
        await this.refreshTopSteps();
        this.publish({ reopen: session.reopen ?? null });
        await this.publishEnding(item, this.endScope(session.endValues ?? null), session.ended.outcome === "quit");
        return;
      }
      // Back from an end inside a loop (`reopen`): the unit it was reached on
      const endedOn = this.backFromEnd ? this.endedOn : null;
      this.endedOn = null;
      if (endedOn && (await this.openEndedUnit(endedOn))) {
        this.backFromEnd = false;
        return;
      }
      // Resume where the coder left off: skip answered questions and
      // finished units (they stay reachable by navigating back).
      this.resuming = true;
      await this.advanceTop();
    } catch (err) {
      this.starting = null;
      this.showError(err, () => this.load());
    }
  }

  /**
   * The items for the step helpers shared with the editor (codebook/tree.ts),
   * typed as full design items: they only read item types, conditions,
   * questions and children, which the coder codebook keeps.
   */
  private get stepItems(): TopLevelItem[] {
    return this.items as TopLevelItem[];
  }

  /** A loop's key (`loopKeys`). */
  private keyOf(loop: CoderUnitLoopItem): string {
    return this.loopKeys.get(loop) ?? "";
  }

  private get inUnit(): boolean {
    return this.activeLoop !== null && this.currentUnit !== null;
  }

  // --- Unit history ---

  private history(loop: CoderUnitLoopItem | null = this.activeLoop): LoopHistory {
    const name = loop ? this.keyOf(loop) : "";
    let history = this.histories.get(name);
    if (!history) {
      const done = this.progress.get(name)?.doneUnitIds ?? [];
      history = { entries: done.map((unitId) => ({ unitId, unit: null, answers: null, done: true })), index: -1 };
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

  /**
   * Makes a history entry the current unit, loading it from the server if
   * needed (a unit finished in an earlier visit), with the answers it had
   * before a new design version, if those weren't saved.
   */
  private async openEntry(index: number): Promise<void> {
    const loop = this.activeLoop!;
    const entry = this.unitHistory[index];
    if (!entry.unit) {
      const unit = await this.coderApi.getLoopUnit(this.keyOf(loop), entry.unitId);
      entry.unit = unit;
      entry.answers = { ...(unit.variables ?? {}), ...this.takeCarryOver(loop, unit.id) };
    }
    this.unitHistoryIndex = index;
    this.currentUnit = entry.unit;
    this.unitVariableValues = currentAnswers(entry.answers ?? {}, loopVariables(loop), entry.unit?.data);
  }

  /** Opens a history entry and shows it at its first or last question. */
  private async showEntry(index: number, at: "first" | "last"): Promise<void> {
    await this.openEntry(index);
    await this.refreshLoopSteps();
    this.loopIndex = at === "first" ? 0 : this.lastQuestionIndex();
    await this.publishLoopStep();
  }

  /**
   * Adds a unit just fetched from the server to the history, with any answers
   * it had before a reload (the browser's draft) or a new design version:
   * those are newer than what the server has.
   */
  private pushFetchedUnit(unit: CoderUnitResponse): void {
    const loop = this.activeLoop!;
    const draft = this.drafts.read(this.keyOf(loop), unit.id);
    const carried = this.takeCarryOver(loop, unit.id);
    this.unitHistory.push({
      unitId: unit.id,
      unit,
      answers: { ...(unit.variables ?? {}), ...draft, ...carried },
      done: false,
    });
  }

  /** Keeps the current unit's answers in its history entry (before leaving it). */
  private syncCurrentUnitAnswers(): void {
    if (this.currentUnit && this.unitHistoryIndex >= 0 && this.unitHistoryIndex < this.unitHistory.length) {
      this.unitHistory[this.unitHistoryIndex].answers = { ...this.unitVariableValues };
    }
  }

  /**
   * Opens the unit an `end` inside a loop was reached on, at its last
   * question (going back after the end). False if it isn't there any more.
   */
  private async openEndedUnit(target: EndUnit): Promise<boolean> {
    await this.refreshTopSteps();
    const found = this.findUnit(target.loop, target.id);
    if (!found) return false;
    this.topIndex = found.topIndex;
    this.reachTopStep(found.topIndex);
    this.leaveLoop();
    this.activeLoop = found.loop;
    await this.openEntry(found.entry);
    await this.refreshLoopSteps();
    this.loopIndex = this.lastQuestionIndex();
    this.resuming = false;
    await this.publishLoopStep();
    return true;
  }

  /** The current unit's last question (not an `end` item its answers lead to); 0 if none. */
  private lastQuestionIndex(): number {
    for (let i = this.loopSteps.length - 1; i >= 0; i--) if (this.loopSteps[i].type !== "end") return i;
    return 0;
  }

  /**
   * Whether a question of the current unit is answered: the coder can go
   * past it. A wrong answer to a practice question isn't one, until the coder
   * answers right or goes on from the feedback (`continueAfterPractice`).
   */
  private isAnswered(step: DesignItem | undefined): boolean {
    const name = step ? itemName(step) : undefined;
    if (!name || this.unitVariableValues[name] === undefined) return false;
    return !this.wrongPractice.has(`${this.currentUnit?.id}:${name}`);
  }

  /** Whether a top-level question already has an answer that fits the current codebook. */
  private hasValidAnswer(item: DesignItem): boolean {
    if (!("variable" in item)) return false;
    const value = this.userVariableValues[item.name];
    return value !== undefined && validateAnswer(item.name, item.variable, value).length === 0;
  }

  // --- Navigation (docs/client.md §2: the rules are tested in navigation.test.ts) ---

  private get navigable(): boolean {
    const { phase } = this.snapshot;
    return phase !== "loading" && phase !== "error" && phase !== "finished";
  }

  canGoBack(): boolean {
    if (!this.navigable) return false;
    if (this.inUnit) {
      if (this.loopIndex > 0) return true;
      if (this.unitHistoryIndex > 0) return true;
    }
    return this.previousTopIndex() >= 0;
  }

  /** `allowFree`: also to steps not reached yet (a preview). */
  canGoForward(allowFree = false): boolean {
    if (!this.navigable) return false;
    const inUnit = this.inUnit;
    if (allowFree) {
      if (inUnit && this.loopIndex < this.loopSteps.length - 1) return true;
      if (inUnit && this.unitHistoryIndex < this.unitHistory.length - 1) return true;
      return this.topIndex < this.topSteps.length - 1;
    }
    if (inUnit) {
      const answered = this.isAnswered(this.loopSteps[this.loopIndex]);
      if (this.loopIndex < this.loopSteps.length - 1) return answered;
      // The unit's last question: on to the next unit the coder has, once it is answered
      if (this.unitHistoryIndex < this.unitHistory.length - 1) return answered;
    }
    return this.topIndex < this.maxReachedTopIndex;
  }

  async goBack(): Promise<void> {
    await this.guarded(() => this.goBackNow());
  }

  /** `force`: also while loading (going back from the end, `reopen`). */
  private async goBackNow(force = false): Promise<void> {
    if (!force && !this.canGoBack()) return;
    this.syncCurrentUnitAnswers();

    // The previous question of this unit
    if (this.inUnit && this.loopIndex > 0) {
      this.loopIndex -= 1;
      await this.publishLoopStep();
      return;
    }

    // The previous unit in the history, at its last question
    if (this.inUnit && this.unitHistoryIndex > 0) {
      await this.showEntry(this.unitHistoryIndex - 1, "last");
      return;
    }

    // The previous top-level step: for a loop its last unit (a loop without units is passed)
    const previous = this.previousTopIndex();
    if (previous < 0) return;
    this.topIndex = previous;
    const prevTop = this.topSteps[previous];
    this.leaveLoop();
    if (prevTop.type === "unit_loop") {
      this.activeLoop = prevTop as CoderUnitLoopItem;
      await this.showEntry(this.unitHistory.length - 1, "last");
      return;
    }
    await this.publishTopStep(prevTop);
  }

  /** The top-level step going back leads to (a loop only if the coder has units in it); -1: none. */
  private previousTopIndex(): number {
    for (let i = this.topIndex - 1; i >= 0; i--) {
      const step = this.topSteps[i];
      if (step.type !== "unit_loop" || this.history(step as CoderUnitLoopItem).entries.length > 0) return i;
    }
    return -1;
  }

  async goForward(allowFree = false): Promise<void> {
    await this.guarded(() => this.goForwardNow(allowFree));
  }

  private async goForwardNow(allowFree = false): Promise<void> {
    if (!this.canGoForward(allowFree)) return;
    this.syncCurrentUnitAnswers();

    // The next question of this unit
    if (this.inUnit && this.loopIndex < this.loopSteps.length - 1) {
      this.loopIndex += 1;
      await this.publishLoopStep();
      return;
    }

    // The next unit in the history, at its first question
    if (this.inUnit && this.unitHistoryIndex < this.unitHistory.length - 1) {
      await this.showEntry(this.unitHistoryIndex + 1, "first");
      return;
    }

    // The next top-level step
    const lastAllowed = allowFree ? this.topSteps.length - 1 : this.maxReachedTopIndex;
    if (this.topIndex >= lastAllowed) return;
    this.topIndex += 1;
    const nextTop = this.topSteps[this.topIndex];
    if (nextTop.type === "unit_loop") {
      await this.enterLoop(nextTop as CoderUnitLoopItem, true);
    } else {
      this.leaveLoop();
      await this.publishTopStep(nextTop);
    }
  }

  /** Goes to a unit of the current loop's history; `allowFetchAhead` (a preview) fetches units up to it first. */
  async jumpToUnit(unitIndex: number, allowFetchAhead = false): Promise<void> {
    await this.guarded(() => this.jumpToUnitNow(unitIndex, allowFetchAhead));
  }

  private async jumpToUnitNow(unitIndex: number, allowFetchAhead = false): Promise<void> {
    if (!this.activeLoop) return;
    this.syncCurrentUnitAnswers();

    while (allowFetchAhead && this.unitHistory.length <= unitIndex) {
      const nextUnit = await this.fetchNextUnit(this.activeLoop);
      if (!nextUnit) break;
      this.pushFetchedUnit(nextUnit);
    }

    if (this.unitHistory.length === 0) return;
    const target = Math.max(0, Math.min(unitIndex, this.unitHistory.length - 1));
    await this.showEntry(target, "first");
  }

  /** Goes to a question of the current unit; `allowAhead`: also past unanswered ones. */
  async jumpToLoopStep(stepIndex: number, allowAhead = false): Promise<void> {
    await this.guarded(() => this.jumpToLoopStepNow(stepIndex, allowAhead));
  }

  private async jumpToLoopStepNow(stepIndex: number, allowAhead = false): Promise<void> {
    if (!this.activeLoop || !this.currentUnit || stepIndex < 0 || stepIndex >= this.loopSteps.length) return;
    if (!allowAhead) {
      const hasUnansweredEarlier = this.loopSteps.slice(0, stepIndex).some((q) => !this.isAnswered(q));
      if (hasUnansweredEarlier && stepIndex > this.loopIndex) return;
    }
    this.syncCurrentUnitAnswers();
    this.loopIndex = stepIndex;
    await this.publishLoopStep();
  }

  /** Goes to a top-level step, and in a loop to a question of its unit. */
  async jumpToUnitQuestion(phaseIndex: number, stepIndex: number, allowAhead = false): Promise<void> {
    await this.guarded(async () => {
      if (phaseIndex < 0 || phaseIndex >= this.topSteps.length) return;
      if (this.topIndex !== phaseIndex) await this.jumpToPhaseNow(phaseIndex, allowAhead);
      if (this.activeLoop && this.currentUnit && stepIndex >= 0 && stepIndex < this.loopSteps.length) {
        await this.jumpToLoopStepNow(stepIndex, allowAhead);
      }
    });
  }

  /** Goes to a top-level step; `allowAhead`: also one not reached yet (a preview). */
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

    if (target.type !== "unit_loop") {
      this.leaveLoop();
      await this.publishTopStep(target);
      return;
    }
    this.activeLoop = target as CoderUnitLoopItem;
    // Back to where the coder was in this loop; or, if they haven't been
    // in it during this visit (e.g. resumed session), to the frontier.
    if (this.unitHistoryIndex >= 0) {
      await this.showEntry(Math.min(this.unitHistoryIndex, this.unitHistory.length - 1), "first");
    } else {
      await this.enterLoop(target as CoderUnitLoopItem);
    }
  }

  // --- Answering ---

  async answer(value: VariableValue): Promise<void> {
    const item = this.snapshot.currentItem;
    if (!item || item.type !== "question") return;
    // The question on screen when the coder answered: by the time this runs
    // (after operations before it), it must still be the one on screen.
    const unitId = this.snapshot.currentUnit?.id ?? null;
    await this.guarded(async () => {
      const now = this.snapshot.currentItem;
      if (now?.type !== "question" || now.name !== item.name || (this.snapshot.currentUnit?.id ?? null) !== unitId)
        return;
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
        await this.retryFrom(() => this.advanceTop());
      } else {
        this.unitVariableValues[item.name] = value;
        this.dropAnswersBuiltOn(item.name);
        this.writeDraft();
        if (!(await this.checkPractice(item.name, value))) return;
        await this.retryFrom(() => this.advanceUnit());
      }
    });
  }

  /**
   * The coder's comment on the answer on screen, changed after answering
   * (the comment box closed): kept in the answer without moving on. A
   * coder-level answer is saved at once; a unit's is in the browser's draft
   * until the unit is saved, and a finished unit (gone back to) is saved
   * again now. Before answering, the comment goes with the answer instead.
   */
  async comment(name: string, comment: string): Promise<void> {
    const unitId = this.snapshot.currentUnit?.id ?? null;
    await this.guarded(async () => {
      const now = this.snapshot.currentItem;
      if (now?.type !== "question" || now.name !== name || (this.snapshot.currentUnit?.id ?? null) !== unitId) return;
      const answers = this.activeLoop === null ? this.userVariableValues : this.unitVariableValues;
      const answer = answers[name];
      if (!answer || (answer.comment ?? "") === comment) return;
      const next = { ...answer, comment: comment || undefined };
      if (!comment) delete next.comment;
      if (this.activeLoop === null) {
        if (this.frozen.has(name)) return;
        this.userVariableValues[name] = next;
        const values = await this.postedCoderValues();
        this.save({ key: "coder", send: () => this.coderApi.postCoderVariables(values, {}) });
        return;
      }
      this.unitVariableValues[name] = next;
      if (this.unitVisible[name]) this.unitVisible[name] = next;
      this.writeDraft();
      this.syncCurrentUnitAnswers();
      const entry = this.unitHistory[this.unitHistoryIndex];
      if (entry?.done) this.saveFinishedUnit();
    });
  }

  /** The timer's key for a question on screen now (`QuestionTimer`): coder-level, or in the current unit. */
  private timingKey(name: string): string | null {
    if (this.activeLoop === null) return `c:${name}`;
    return this.currentUnit ? `u:${this.currentUnit.id}:${name}` : null;
  }

  /**
   * The unit's other answers that no longer fit after this one changed (a
   * relation to a span the coder removed, an option that was that span) are
   * dropped: the coder is asked again, and until then they are saved as
   * skipped. The server refuses a unit with such an answer.
   */
  private dropAnswersBuiltOn(changed: string): void {
    const answers = this.unitVariableValues;
    const fitting = currentAnswers(answers, loopVariables(this.activeLoop!), this.currentUnit?.data);
    // (In place: these are the answers of the unit on screen, also after a failed operation)
    for (const name of Object.keys(answers)) if (name !== changed && !(name in fitting)) delete answers[name];
  }

  /**
   * The coder-level answers to store: an answer to a question a condition
   * now hides (an earlier answer changed) is stored as `skip`, as in loops.
   * The answer itself stays here, should the question show again. Answers
   * that don't fit the codebook any more (a new design version removed the
   * question or the option) are left out: the server refuses a post with one.
   */
  private async postedCoderValues(): Promise<Record<string, VariableValue>> {
    const { visible } = await computeTopLevelSteps(this.stepItems, this.userVariableValues, this.stepContext);
    const fitting = Object.entries(this.userVariableValues).filter(([name, value]) => {
      const variable = this.coderQuestions.get(name);
      return variable !== undefined && validateAnswer(name, variable, value).length === 0;
    });
    return Object.fromEntries(
      fitting.map(([name, value]) => [name, name in visible ? value : { done: true, skip: true }]),
    );
  }

  /**
   * A practice unit's question, checked as it is answered: right flashes a
   * check; wrong shows the feedback with the question. Returns whether the
   * coder goes on now: right, or a question without a check. After a wrong
   * answer without `retry` the coder goes on with `continueAfterPractice`.
   */
  private async checkPractice(name: string, value: VariableValue): Promise<boolean> {
    const unit = this.currentUnit;
    const check = unit?.practice?.questions[name];
    const key = check ? parseAnswerKey(check.key) : null;
    if (!unit?.practice || !check || !key) return true;
    const solvedKey = `${unit.id}:${name}`;
    if (this.solvedPractice.has(solvedKey)) return true;
    const tries = this.practiceTries.get(unit.id) ?? new Map<string, number>();
    tries.set(name, (tries.get(name) ?? 0) + 1);
    this.practiceTries.set(unit.id, tries);
    if (answerMatchesKey(value, key)) {
      this.solvedPractice.add(solvedKey);
      this.wrongPractice.delete(solvedKey);
      this.publish({ practiceWrong: null, practiceRight: this.snapshot.practiceRight + 1 });
      return true;
    }
    this.wrongPractice.add(solvedKey);
    const scope = this.scope(this.unitVariableValues, unitScopeData(unit) as UnitData);
    const message = check.message
      ? staticTemplate(check.message)
      : unit.practice.message
        ? await renderTemplate(unit.practice.message, scope, this.expressionCache, `practice:${name}`)
        : staticTemplate(expectedAnswerText(name, this.questions.get(name), key));
    // Shown again (the question stays): the field starts from the wrong answer
    this.syncCurrentUnitAnswers();
    await this.publishLoopStep({ reopen: false });
    this.publish({
      practiceWrong: { unitId: unit.id, question: name, messages: [message], retry: unit.practice.retry },
    });
    return false;
  }

  /** A wrong practice answer without `retry`: the coder goes on with their answer. */
  async continueAfterPractice(): Promise<void> {
    const wrong = this.snapshot.practiceWrong;
    if (!wrong || wrong.retry || this.currentUnit?.id !== wrong.unitId) return;
    this.solvedPractice.add(`${wrong.unitId}:${wrong.question}`);
    this.wrongPractice.delete(`${wrong.unitId}:${wrong.question}`);
    this.publish({ practiceWrong: null });
    await this.guarded(() => this.advanceUnit());
  }

  // --- Saving ---

  /** Saves in the background (`Outbox`): the coder goes on at once. */
  private save(item: OutboxItem): void {
    if (this.serverEnded) return;
    this.outbox.add(item);
  }

  /**
   * Finished units an earlier visit didn't get sent (`UnsentUnits`: the tab
   * was closed without a connection) are sent now. One the server doesn't
   * take any more (a new design version) comes again with its answers, as
   * far as they fit (`carryOver`). Returns whether there were any.
   */
  private async sendUnsentUnits(): Promise<boolean> {
    // (Starting again in the same visit: what waits is in the outbox)
    const posts = this.outbox.waiting.length === 0 ? this.unsent.read() : [];
    for (const post of posts) {
      try {
        await this.coderApi.postUnitVariables(post.unitId, post.answers, post.loop, post.timings);
      } catch (err) {
        if (isTransient(err)) throw err;
        this.carryOver.set(`${post.loop}/${post.unitId}`, post.answers);
      }
    }
    this.unsent.write([]);
    return posts.length > 0;
  }

  /**
   * Saving failed in the background. While the coder's last action is still
   * being handled, that action meets the error itself (`guarded`).
   * Otherwise: a new design version loads the session again
   * (`reloadAfterPublish`); another error shows, and `retry()` saves again.
   */
  private reportSaveError(): void {
    const err = this.outbox.error;
    if (err === null || this.busy > 0 || this.snapshot.phase === "error") return;
    if (errorCodeOf(err) === "codebook_changed") {
      void this.guarded(() => this.reloadAfterPublish());
      return;
    }
    this.showError(err, () => this.outbox.flush());
    this.publish({ retrying: false });
  }

  /** Shows an error instead of the step the coder is on; `retry()` then runs `repeat`. */
  private showError(err: unknown, repeat: () => Promise<void>): void {
    if (this.snapshot.phase !== "error") this.phaseBeforeError = this.snapshot.phase;
    this.lastFailedOperation = repeat;
    // A unit the server refused: the coder can also go back to it (`backToRefusedUnit`)
    const refused = err === this.outbox.error && isRefusal(err) ? this.outbox.failed?.unit : undefined;
    this.publish({
      phase: "error",
      ...errorFields(err),
      refusedUnit: refused ? { loop: refused.loop, unitId: refused.unitId } : null,
    });
  }

  /**
   * After the server refused a finished unit (`refusedUnit`): back to that
   * unit instead of sending the same again (`retry()`). It opens at its first
   * question without an answer that fits, and is saved when the coder
   * finishes it again.
   */
  async backToRefusedUnit(): Promise<void> {
    const refused = this.snapshot.refusedUnit;
    if (this.snapshot.phase !== "error" || !refused) return;
    await this.guarded(async () => {
      const found = this.findUnit(refused.loop, refused.unitId);
      if (!found) return;
      this.outbox.dropFailed();
      this.lastFailedOperation = null;
      this.topIndex = found.topIndex;
      this.leaveLoop();
      this.activeLoop = found.loop;
      this.unitHistory[found.entry].done = false;
      await this.openAtFirstOpenStep(found.entry);
    });
  }

  /** Where a unit the coder has is: its loop's top-level step, and its place in the loop's history. */
  private findUnit(
    loopKey: string,
    unitId: number,
  ): { topIndex: number; loop: CoderUnitLoopItem; entry: number } | null {
    const topIndex = this.topSteps.findIndex(
      (step) => step.type === "unit_loop" && this.keyOf(step as CoderUnitLoopItem) === loopKey,
    );
    if (topIndex < 0) return null;
    const loop = this.topSteps[topIndex] as CoderUnitLoopItem;
    const entry = this.history(loop).entries.findIndex((e) => e.unitId === unitId);
    return entry < 0 ? null : { topIndex, loop, entry };
  }

  /** Shows the step the coder is on again (after an error): the question, else what was there (the ending). */
  private async republish(): Promise<void> {
    const top = this.topSteps[this.topIndex];
    if (this.inUnit) await this.publishLoopStep();
    else if (!this.activeLoop && top?.type === "question") await this.publishTopStep(top);
    else this.publish({ phase: this.phaseBeforeError });
  }

  /**
   * Runs an operation that talks to the server (answering, navigating).
   * Operations run one at a time, in the order they came (a double click, a
   * fast swipe, back pressed while an answer is handled): each starts from
   * where the one before left the coder. A failure leaves the coder where
   * they were, and shows as an error that `retry()` repeats; a new design
   * version (`codebook_changed`) loads the session again. `afterError`
   * (`retry()`): the step the coder was on is shown again first.
   */
  private guarded(operation: () => Promise<void>, afterError = false): Promise<void> {
    const run = this.turn.then(() => this.runGuarded(operation, afterError));
    this.turn = run.catch(() => {});
    return run;
  }

  private async runGuarded(operation: () => Promise<void>, afterError: boolean): Promise<void> {
    const before = this.position();
    this.failing = operation;
    this.busy += 1;
    try {
      if (afterError) await this.republish();
      await operation();
    } catch (err) {
      // The session already ended (gold checks): what was underway doesn't matter
      if (this.serverEnded) return;
      this.restore(before);
      if (errorCodeOf(err) === "codebook_changed") await this.reloadAfterPublish();
      else this.showError(err, this.failing);
      return;
    } finally {
      this.busy -= 1;
    }
    // A save that failed in the background meanwhile
    this.reportSaveError();
  }

  /**
   * Runs the rest of an operation, `step`: if it fails, `retry()` repeats
   * only this. What the operation did before (an answer kept, a save queued)
   * is done, and isn't done again.
   */
  private retryFrom(step: () => Promise<void>): Promise<void> {
    this.failing = step;
    return step();
  }

  private position(): Position {
    return {
      topSteps: this.topSteps,
      topIndex: this.topIndex,
      reachedTopSteps: new Set(this.reachedTopSteps),
      coderVisible: this.coderVisible,
      activeLoop: this.activeLoop,
      currentUnit: this.currentUnit,
      loopSteps: this.loopSteps,
      loopStepLayouts: this.loopStepLayouts,
      loopIndex: this.loopIndex,
      unitVariableValues: this.unitVariableValues,
      unitVisible: this.unitVisible,
      historyIndexes: new Map([...this.histories].map(([key, history]) => [key, history.index])),
    };
  }

  private restore(position: Position): void {
    const { historyIndexes, ...where } = position;
    Object.assign(this, where);
    this.setMaxReachedTopIndex();
    // (A loop first entered in the failed operation: not on any unit of it)
    for (const [key, history] of this.histories) history.index = historyIndexes.get(key) ?? -1;
  }

  /**
   * A new design version was deployed while the coder was working (the
   * server answered `codebook_changed`): load the session again, as after a
   * reload, so the coder continues where they were under the new version.
   * Unsaved answers to units come back with their units, if they still fit;
   * unsaved coder-level answers are asked again.
   */
  private async reloadAfterPublish(): Promise<void> {
    this.carryUnsavedUnits();
    this.outbox.clear();
    // A practice question's feedback belongs to the unit, which is served again
    this.publish({ practiceWrong: null });
    this.unitQueues.clear();
    this.starting = null;
    this.userVariableValues = {};
    this.leaveLoop();
    this.expressionCache = new ExpressionCache();
    await this.load();
  }

  /** Keeps the answers to every unit that isn't saved (`carryOver`): started and not finished, or finished and still to be sent. */
  private carryUnsavedUnits(): void {
    this.syncCurrentUnitAnswers();
    for (const [loop, history] of this.histories) {
      for (const entry of history.entries) {
        if (!entry.done && entry.answers) this.carryOver.set(`${loop}/${entry.unitId}`, entry.answers);
      }
    }
    for (const { unit } of this.outbox.waiting) {
      if (unit) this.carryOver.set(`${unit.loop}/${unit.unitId}`, unit.answers);
    }
  }

  /**
   * After a new design version: the finished units of the loop whose changed
   * answers weren't saved (`carryOver`) are saved again, as far as the
   * answers still fit.
   */
  private async saveCarriedUnits(): Promise<void> {
    const loopKey = this.keyOf(this.activeLoop!);
    for (const [index, entry] of this.unitHistory.entries()) {
      if (!entry.done || !this.carryOver.has(`${loopKey}/${entry.unitId}`)) continue;
      await this.openEntry(index);
      await this.refreshLoopSteps();
      this.saveFinishedUnit();
    }
  }

  /** The coder read the new units message. */
  dismissNewUnits(): void {
    this.publish({ newUnits: null });
  }

  /**
   * Repeats what failed (the operation, or the part of it that was still to
   * do), from the step the coder was on, and tries saving again.
   */
  async retry(): Promise<void> {
    const op = this.lastFailedOperation;
    if (!op) return;
    this.lastFailedOperation = null;
    this.outbox.error = null;
    await this.guarded(op, true);
  }

  // --- Steps and rendering ---

  private get stepContext(): StepContext {
    return { questions: this.questions, cache: this.expressionCache, session: this.session };
  }

  /** The scope for scripts and templates: answers, the unit's data, and the session's values. */
  private scope(answers: Record<string, VariableValue>, unit?: UnitData | null): ReferenceScope {
    return buildScope(this.questions, answers, unit, this.session);
  }

  private async refreshTopSteps(): Promise<void> {
    const { steps, visible } = await computeTopLevelSteps(this.stepItems, this.userVariableValues, this.stepContext);
    this.topSteps = steps;
    this.coderVisible = visible;
    this.setMaxReachedTopIndex();
  }

  /** A top-level step as `reachedTopSteps` knows it: a loop by its key, another item by its name. */
  private topStepKey(step: DesignItem): string {
    return step.type === "unit_loop" ? `loop:${this.keyOf(step as CoderUnitLoopItem)}` : `item:${itemName(step) ?? ""}`;
  }

  /** The coder got to a top-level step. */
  private reachTopStep(index: number): void {
    const step = this.topSteps[index];
    if (step) this.reachedTopSteps.add(this.topStepKey(step));
    this.setMaxReachedTopIndex();
  }

  private setMaxReachedTopIndex(): void {
    const last = this.topSteps.findLastIndex((step) => this.reachedTopSteps.has(this.topStepKey(step)));
    this.maxReachedTopIndex = Math.max(0, last);
  }

  private async refreshLoopSteps(): Promise<void> {
    if (!this.activeLoop || !this.currentUnit) return;
    const { steps, visible, layouts } = await computeLoopSteps(
      this.activeLoop,
      this.coderVisible,
      this.unitVariableValues,
      unitScopeData(this.currentUnit) as UnitData,
      this.stepContext,
    );
    this.loopSteps = steps;
    this.loopStepLayouts = layouts;
    this.unitVisible = visible;
  }

  /**
   * Whether a question's instruction opens by itself now (`instructionOpen`):
   * `first`, on the first unit the coder answers it on (also after a reload:
   * not once they finished units in the loop); `practice`, on practice units.
   */
  private opensInstruction(item: DesignItem): boolean {
    const open = "instructionOpen" in item ? item.instructionOpen : undefined;
    if (!open || !this.activeLoop || !this.currentUnit) return false;
    if (open === "practice") return this.currentUnit.data?.test_set === "practice";
    const key = `${this.keyOf(this.activeLoop)}/${"name" in item ? item.name : ""}`;
    const unitId = this.currentUnit.id;
    const shownOn = this.instructionShownOn.get(key);
    if (shownOn !== undefined) return shownOn === unitId;
    const done = this.progress.get(this.keyOf(this.activeLoop))?.doneUnitIds ?? [];
    if (done.some((id) => id !== unitId)) return false;
    this.instructionShownOn.set(key, unitId);
    return true;
  }

  /** A question's texts with their values filled in (in a loop, its snippets too), and whether its instruction opens. */
  private async questionTexts(
    item: DesignItem | undefined,
    scope: ReferenceScope,
    snippets?: Record<string, string>,
    reopen = true,
  ): Promise<QuestionTexts | null> {
    if (!item || !("variable" in item) || !("question" in item.variable)) return null;
    const { question } = item.variable;
    const instruction = "instruction" in item ? item.instruction : undefined;
    const [questionText, instructionText] = await Promise.all([
      question
        ? renderTemplate(question, scope, this.expressionCache, `question:${item.name}`, { snippets })
        : undefined,
      instruction
        ? renderTemplate(instruction, scope, this.expressionCache, `instruction:${item.name}`, { snippets })
        : undefined,
    ]);
    return {
      question: questionText,
      instruction: instructionText,
      ...(instructionText && reopen && this.opensInstruction(item) ? { openInstruction: true } : {}),
    };
  }

  /**
   * Publishes the current step of the current unit, with the layout and texts
   * rendered. `reopen: false`: the question is shown again (a wrong practice
   * answer), its instruction doesn't open by itself again.
   */
  private async publishLoopStep({ reopen = true }: { reopen?: boolean } = {}): Promise<void> {
    const loop = this.activeLoop;
    const unit = this.currentUnit;
    if (!loop || !unit) return;
    const step = this.loopSteps[this.loopIndex];
    // The layout this step shows the unit with; none: the question alone
    const layout = this.loopStepLayouts[this.loopIndex] ?? null;
    const scope = this.scope(this.unitVisible, unitScopeData(unit) as UnitData);
    const [template, texts] = await Promise.all([
      layout
        ? renderTemplate(
            layout.template,
            scope,
            this.expressionCache,
            `layout:${this.keyOf(loop)}:${loopLayouts(loop.children).indexOf(layout)}`,
            {
              progress: { current: step && "name" in step ? step.name : null, order: loopQuestionNames(loop) },
              snippets: layout.snippets,
              selectable: spanColumns(loop),
            },
          )
        : null,
      // Texts may use any of the loop's snippets
      this.questionTexts(step, scope, loopSnippets(loop.children), reopen),
    ]);
    this.publish({
      phase: "unit_variable",
      currentItem: step,
      currentUnit: unit,
      currentUnitLayout: layout,
      currentLoopVariables: loopVariables(loop),
      currentUnitTemplate: template,
      currentTexts: texts,
      currentUnitVariables: { ...this.unitVariableValues },
      currentFrozen: false,
      // (Feedback on a wrong practice answer is for the step it was given on: `checkPractice` shows it after this)
      practiceWrong: null,
    });
  }

  /** Publishes a top-level (coder-level) question. */
  private async publishTopStep(item: DesignItem): Promise<void> {
    this.publish({
      phase: "user_variable",
      currentItem: item,
      currentUnit: null,
      currentUnitLayout: null,
      currentLoopVariables: null,
      currentUnitTemplate: null,
      currentTexts: await this.questionTexts(item, this.scope(this.coderVisible)),
      currentUnitVariables: null,
      currentFrozen: "name" in item && this.frozen.has(item.name),
      practiceWrong: null,
    });
  }

  // --- Units from the server ---

  /**
   * The coder's next unit in a loop, or null when they are done with it.
   * Units come in batches (`UNIT_BATCH`), fetched again in the background
   * before the batch runs out, so the coder doesn't wait.
   */
  private async fetchNextUnit(loop: CoderUnitLoopItem): Promise<CoderUnitResponse | null> {
    const queue = this.unitQueue(loop);
    if (queue.units.length === 0) await this.fillQueue(loop);
    // Units answered but not saved yet came back (the server doesn't know
    // they are done): once saved, it knows what is next.
    if (queue.units.length === 0 && this.outbox.waiting.some((item) => item.unit?.loop === this.keyOf(loop))) {
      await this.outbox.flush();
      await this.fillQueue(loop);
    }
    const unit = queue.units.shift() ?? null;
    if (unit && queue.units.length < UNIT_REFILL) this.fillQueue(loop).catch(() => {}); // tried again when needed
    return unit;
  }

  private unitQueue(loop: CoderUnitLoopItem) {
    const key = this.keyOf(loop);
    let queue = this.unitQueues.get(key);
    if (!queue) this.unitQueues.set(key, (queue = { units: [], filling: null, seen: new Set<number>() }));
    return queue;
  }

  /** Asks the server for the coder's next units; adds those the coder doesn't have yet. */
  private fillQueue(loop: CoderUnitLoopItem): Promise<void> {
    const queue = this.unitQueue(loop);
    queue.filling ??= (async () => {
      try {
        const units = await this.coderApi.getNextUnits(this.keyOf(loop), UNIT_BATCH);
        const known = new Set([...this.history(loop).entries.map((e) => e.unitId), ...queue.seen]);
        const fresh = units.filter((u) => !known.has(u.id));
        for (const u of fresh) queue.seen.add(u.id);
        queue.units.push(...fresh);
      } finally {
        queue.filling = null;
      }
    })();
    return queue.filling;
  }

  /** Answers to a unit not saved yet, kept over a new design version (`carryOver`): given once. */
  private takeCarryOver(loop: CoderUnitLoopItem, unitId: number): Record<string, VariableValue> {
    const key = `${this.keyOf(loop)}/${unitId}`;
    const answers = this.carryOver.get(key) ?? {};
    this.carryOver.delete(key);
    return answers;
  }

  /** Keeps the answers to the unit on screen in the browser (`UnitDraftStore`), until the unit is finished. */
  private writeDraft(): void {
    // Not for practice units: a restored answer would skip its check
    if (!this.activeLoop || !this.currentUnit || this.currentUnit.practice) return;
    // A finished unit (gone back to) is saved again at once (`advanceUnit`)
    if (this.unitHistory[this.unitHistoryIndex]?.done) return;
    this.drafts.write({
      loop: this.keyOf(this.activeLoop),
      unitId: this.currentUnit.id,
      answers: this.unitVariableValues,
    });
  }

  // --- The end of the session ---

  /**
   * The coder reached an `end` item (inside a unit loop: on `unit`), or
   * without one the end of the study: tells the server, and shows the ending.
   */
  private async reachEnd(item: EndItem | null, scope: ReferenceScope, unit?: EndUnit): Promise<void> {
    // (If it fails, `retry()` ends the session: the steps that led here aren't taken again.)
    await this.retryFrom(async () => {
      // Everything is saved before the session ends (the server accepts nothing after).
      await this.outbox.flush();
      const ended = await this.coderApi.endSession(item?.name, unit);
      this.endedOn = unit ?? null;
      this.publish({ reopen: ended?.reopen ?? null });
      await this.publishEnding(item, scope);
    });
  }

  /**
   * The values an ending is shown with again, after a reload: the coder's,
   * and for an end inside a unit loop also the unit's data and answers (as
   * when it was reached). Without the unit (e.g. no longer in the study), the
   * coder's only.
   */
  private endScope(values: EndValues | null): ReferenceScope {
    if (!values) return this.scope(this.coderVisible);
    return this.scope(
      { ...this.coderVisible, ...values.variables, ...values.unit?.variables },
      values.unit?.data as UnitData | undefined,
    );
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
      await this.load();
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
      await this.outbox.flush();
      await this.coderApi.quitSession(requestDeletion);
      if (requestDeletion) this.publish({ deletionRequested: true });
      if (this.snapshot.phase !== "finished") await this.publishEnding(null, this.scope(this.coderVisible), true);
    });
  }

  /** Publishes the finished phase; with an `end` item, its message and redirect. */
  private async publishEnding(item: EndItem | null, scope: ReferenceScope, quit = false): Promise<void> {
    const ending: SessionEnding | null = item && {
      item,
      message: item.message
        ? await renderTemplate(item.message, scope, this.expressionCache, `end:${item.name}`)
        : null,
      redirectUrl: item.redirectUrl ? fillRedirectUrl(item.redirectUrl, scope) : null,
    };
    this.leaveLoop();
    this.drafts.clearAll();
    this.publish({
      phase: "finished",
      currentItem: null,
      currentUnit: null,
      currentUnitLayout: null,
      currentLoopVariables: null,
      currentUnitTemplate: null,
      currentTexts: null,
      currentUnitVariables: null,
      practiceWrong: null,
      ending,
      quit,
    });
  }

  /**
   * The server ended the session (gold checks, after a unit posted in the
   * background): the coder sees the ending at once, even if they started on
   * the next unit (once the step they were taking is done); what they do
   * after is not saved (the server accepts nothing more), and no error shows
   * for it.
   */
  private endedByServer(name: string): void {
    if (this.serverEnded) return;
    this.serverEnded = true;
    this.drafts.clearAll();
    this.outbox.clear();
    this.publish({ practiceWrong: null });
    void this.guarded(() => this.publishEnding(findEnd(this.stepItems, name), this.scope(this.coderVisible)));
  }

  // --- Moving on after an answer ---

  /** The next top-level step: skips answered questions while resuming, asks the server for experiments' conditions. */
  private async advanceTop(): Promise<void> {
    await this.refreshTopSteps();
    this.topIndex += 1;
    this.reachTopStep(this.topIndex);
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
      await this.enterLoop(next as CoderUnitLoopItem);
      return;
    }

    // An experiment without a value: an invisible step. The server computes
    // it now (the answers it may balance on saved first), and the flow goes on with it.
    if (next.type === "experiment") {
      await this.outbox.flush();
      this.userVariableValues[next.name] = await this.coderApi.assignCondition(next.name);
      this.topIndex -= 1;
      await this.advanceTop();
      return;
    }

    if (this.resuming && this.hasValidAnswer(next)) {
      await this.advanceTop();
      return;
    }

    this.resuming = false;
    await this.publishTopStep(next);
  }

  /** The next question of the unit; after its last, saves the unit and moves on (`continueAfterUnit`). */
  private async advanceUnit(): Promise<void> {
    if (!this.activeLoop) return;
    if (!this.currentUnit) {
      await this.nextUnitAtFrontier();
      return;
    }

    await this.refreshLoopSteps();
    this.loopIndex += 1;
    const next = this.loopSteps[this.loopIndex];
    if (next && next.type !== "end") {
      // A finished unit (gone back to): a changed answer is saved now. Coders who change an answer
      // often leave the unit without answering the rest again; a question the change now shows is
      // saved as skipped until they answer it.
      if (this.unitHistory[this.unitHistoryIndex]?.done) this.saveFinishedUnit();
      await this.publishLoopStep();
      return;
    }
    this.saveFinishedUnit();
    // (If going on fails, `retry()` goes on: the unit isn't saved again.)
    await this.retryFrom(() => this.continueAfterUnit(next));
  }

  /**
   * The unit is finished: posts an answer for every question of the loop,
   * `skip` for those a condition hides (also an answer to a question an
   * earlier answer now hides), since the server only accepts complete units
   * (docs/architecture.md §8.2).
   */
  private saveFinishedUnit(): void {
    const loop = this.activeLoop!;
    const { id } = this.currentUnit!;
    const doneValues: Record<string, VariableValue> = {};
    for (const name of loopVariables(loop).keys()) {
      const value = this.unitVisible[name];
      doneValues[name] = value ? { ...value, done: true } : { done: true, skip: true };
    }
    const timings = this.timer.take(`u:${id}:`);
    // Practice questions: how many tries it took (1: right the first time)
    for (const [name, tries] of this.practiceTries.get(id) ?? []) {
      if (timings[name]) timings[name] = { ...timings[name], tries };
    }
    this.practiceTries.delete(id);
    const loopKey = this.keyOf(loop);
    this.saveUnit({ loop: loopKey, unitId: id, answers: doneValues, timings });
    for (const name of this.dependencies.get(loopKey) ?? []) if (name in this.userVariableValues) this.frozen.add(name);
    if (this.unitHistoryIndex >= 0 && this.unitHistoryIndex < this.unitHistory.length) {
      this.unitHistory[this.unitHistoryIndex].answers = { ...doneValues };
      this.unitHistory[this.unitHistoryIndex].done = true;
    }
  }

  /** Saves a finished unit in the background. */
  private saveUnit(post: UnitPost): void {
    const { loop, unitId, answers, timings } = post;
    this.save({
      key: `unit:${loop}/${unitId}`,
      send: async () => {
        const submitted: SubmitUnitResponse | null =
          (await this.coderApi.postUnitVariables(unitId, answers, loop, timings)) || null;
        this.drafts.clear(loop, unitId);
        // Gold checks ended the session (health ran out): it ends now, wherever the coder is.
        if (submitted?.end) this.endedByServer(submitted.end);
      },
      unit: post,
    });
  }

  /** After a unit is finished and saved: an `end` in the loop, the next unit in history, or the next one from the server. */
  private async continueAfterUnit(next: DesignItem | undefined): Promise<void> {
    if (this.activeLoop && this.currentUnit) {
      // An `end` item in the loop: the unit is saved, then the session ends.
      if (next?.type === "end") {
        const scope = this.scope(this.unitVisible, unitScopeData(this.currentUnit) as UnitData);
        await this.reachEnd(next, scope, { loop: this.keyOf(this.activeLoop), id: this.currentUnit.id });
        return;
      }

      // Reviewing an earlier unit: on to the next unit in the history
      if (this.unitHistoryIndex < this.unitHistory.length - 1) {
        await this.openEntry(this.unitHistoryIndex + 1);
        await this.refreshLoopSteps();
        this.loopIndex = 0;
        if (this.loopSteps[0]) {
          await this.publishLoopStep();
          return;
        }
      }

      this.unitVariableValues = {};
      this.currentUnit = null;
    }
    // The first unit the coder started and didn't finish (they went back from it), else a new one
    const unfinished = this.activeLoop ? this.unitHistory.findIndex((entry) => !entry.done) : -1;
    if (unfinished >= 0) await this.openAtFirstOpenStep(unfinished);
    else await this.nextUnitAtFrontier();
  }

  /** The next unit from the server; without one, the loop is done and the next top-level step follows. */
  private async nextUnitAtFrontier(): Promise<void> {
    if (!this.activeLoop) return;
    const nextUnit = await this.fetchNextUnit(this.activeLoop);
    if (!nextUnit) {
      this.leaveLoop();
      await this.advanceTop();
      return;
    }
    this.pushFetchedUnit(nextUnit);
    await this.openAtFirstOpenStep(this.unitHistory.length - 1);
  }

  /**
   * Opens a unit of the coder's history at its first question without a
   * (still valid) answer: the unit may be partly done (reload mid-unit, the
   * coder went back from it, or the codebook gained a question). `atStart`:
   * at its first question instead.
   */
  private async openAtFirstOpenStep(index: number, atStart = false): Promise<void> {
    await this.openEntry(index);
    await this.refreshLoopSteps();
    const firstOpen = this.loopSteps.findIndex((step) => !this.isAnswered(step));
    this.loopIndex = atStart ? 0 : firstOpen === -1 ? this.lastQuestionIndex() : firstOpen;
    if (!this.loopSteps[this.loopIndex]) {
      // A unit without steps (conditions hide them all): move past it.
      this.loopIndex = -1;
      await this.advanceUnit();
      return;
    }

    this.resuming = false;
    await this.publishLoopStep();
  }

  /**
   * Moving forward into a loop (the coder answered the question before it,
   * or pressed next): its unit the coder started but didn't finish, if any
   * (they went back from it), else the next unit from the server. `atStart`
   * (next): at that unit's first question, else at its first unanswered one.
   */
  private async enterLoop(loop: CoderUnitLoopItem, atStart = false): Promise<void> {
    this.leaveLoop();
    this.activeLoop = loop;
    if (this.carryOver.size > 0) await this.saveCarriedUnits();
    const unfinished = this.unitHistory.findIndex((entry) => !entry.done);
    if (unfinished >= 0) await this.openAtFirstOpenStep(unfinished, atStart);
    else await this.nextUnitAtFrontier();
  }

  /** Not in a loop any more: nothing of its unit stays (navigation reads these). */
  private leaveLoop(): void {
    this.activeLoop = null;
    this.currentUnit = null;
    this.loopSteps = [];
    this.loopStepLayouts = [];
    this.loopIndex = -1;
    this.unitVariableValues = {};
    this.unitVisible = {};
  }

  // --- Publishing ---

  private buildNavigation(): StudyManagerNavigation {
    const phases: NavigationPhase[] = this.topSteps.map((step, index) => {
      const isCurrent = index === this.topIndex;
      const phase: NavigationPhase = {
        index,
        name: step.type === "unit_loop" ? this.keyOf(step) : (itemName(step) ?? ""),
        type: step.type as NavigationPhase["type"],
        label: stepLabel(step),
        isCurrent,
        isCompleted: index < this.topIndex,
        unitCount: undefined,
        totalUnits: undefined,
        currentUnitIndex: undefined,
        units: undefined,
        questions: undefined,
      };
      if (step.type !== "unit_loop") return phase;
      const history = this.history(step);
      phase.unitCount = history.entries.length;
      phase.questionCount = loopQuestionNames(step as CoderUnitLoopItem).length;
      phase.totalUnits = this.progress.get(this.keyOf(step))?.totalUnits ?? undefined;
      if (isCurrent && this.activeLoop) {
        phase.currentUnitIndex = history.index >= 0 ? history.index : 0;
        phase.units = history.entries.map((entry, i): NavigationUnitItem => ({
          index: i,
          id: entry.unitId,
          externalId: entry.unit?.externalId ?? `#${entry.unitId}`,
          isCurrent: i === history.index,
        }));
        phase.questions = this.reachedLoopQuestions();
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

  /**
   * The questions the current unit shows (conditions applied) that the coder
   * got to: up to the current one, or up to the first unanswered one (as
   * `jumpToLoopStep` allows). Later ones may never show (conditions).
   */
  private reachedLoopQuestions(): NavigationUnitQuestion[] {
    const firstOpen = this.loopSteps.findIndex((q) => !this.isAnswered(q));
    const reached = Math.max(this.loopIndex, firstOpen === -1 ? this.loopSteps.length - 1 : firstOpen);
    return this.loopSteps.flatMap((q, i) =>
      q.type === "question" && i <= reached
        ? [
            {
              index: i,
              name: q.name,
              label: stepLabel(q),
              isCurrent: i === this.loopIndex,
              isCompleted: i < this.loopIndex,
            },
          ]
        : [],
    );
  }

  private publish(next: Partial<StudyManagerSnapshot>): void {
    // After the server ended the session, its ending stays on screen
    if (this.serverEnded && this.snapshot.phase === "finished" && next.phase !== undefined && next.phase !== "finished")
      return;
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
