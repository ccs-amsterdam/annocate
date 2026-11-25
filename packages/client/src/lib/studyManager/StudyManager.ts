import type {
  EndUnit,
  DesignItem,
  SubmitUnitResponse,
  CoderUnitLoopItem,
  VariableValue,
  SessionResponse,
  EndItem,
  ReferenceScope,
  UnitData,
} from "@annotinder/contracts";
import { unitScopeData, itemName, validateAnswer } from "@annotinder/contracts";
import type { CoderApi } from "../api/httpCoderApi";
import { ExpressionCache } from "../codebook/expressionCache";
import { computeLoopSteps, computeTopLevelSteps, type StepContext } from "../codebook/tree";
import { QuestionTimer } from "./timing";
import { endScope, renderEnding } from "./endings";
import { errorCodeOf, errorFields, isRefusal, isTransient } from "./errors";
import { InstructionOpening } from "./instructionOpening";
import { currentAnswers, loopVariables } from "./items";
import { navigationSnapshot, reachedQuestions } from "./navigationSnapshot";
import { Operations } from "./Operations";
import { Outbox, UnsentUnits, type OutboxItem, type UnitPost } from "./outbox";
import { lastQuestionIndex, Position, type OpenUnit, type SavedPosition } from "./Position";
import { PracticeChecks } from "./practice";
import { SessionDesign } from "./sessionDesign";
import { INITIAL_SNAPSHOT, NO_STEP } from "./snapshots";
import {
  renderLoopQuestionTexts,
  renderPracticeFeedback,
  renderQuestionTexts,
  renderUnitLayout,
  type LoopStep,
} from "./stepRenderer";
import { UnitDraftStore } from "./unitDraft";
import { UnitHistories, type LoopHistory } from "./UnitHistory";
import { UnitQueues } from "./UnitQueue";
import type { StudyManagerListener, StudyManagerNavigation, StudyManagerSnapshot } from "./types";

/** What a failed operation puts back: the step the coder is on, and the unit of each loop they are on. */
interface Place {
  position: SavedPosition;
  units: Map<string, number>;
}

/** A unit the coder has: its loop's top-level step, and its place in the loop's history. */
interface FoundUnit {
  topIndex: number;
  loop: CoderUnitLoopItem;
  entry: number;
}

/** An answer with its comment changed (an empty comment: without one). */
function withComment(answer: VariableValue, comment: string): VariableValue {
  const next = { ...answer, comment: comment || undefined };
  if (!comment) delete next.comment;
  return next;
}

/**
 * Drives one coder's session (docs/client.md §2 "StudyManager"): which step
 * is shown, back and forward navigation, jumps, editing earlier answers, and
 * saving answers in the background. Framework-agnostic; `useStudyManager`
 * binds it to React.
 *
 * The parts: `SessionDesign` (the design the session codes with), `Position`
 * (where the coder is), `UnitHistories` and `UnitQueues` (the units the
 * coder has and gets), `Operations` (one at a time, and what Retry repeats),
 * `Outbox` (saving in the background), `PracticeChecks`, and the rendering
 * of steps (`stepRenderer`, `endings`) and of the navigation
 * (`navigationSnapshot`).
 */
export class StudyManager {
  private readonly coderApi: CoderApi;
  private readonly listeners: Set<StudyManagerListener> = new Set();
  private readonly timer: QuestionTimer;
  private readonly outbox: Outbox;
  private readonly drafts = new UnitDraftStore();
  private readonly unsent = new UnsentUnits();
  private readonly histories: UnitHistories;
  private readonly queues: UnitQueues;
  private readonly operations: Operations<Place>;
  private readonly practice = new PracticeChecks();
  private readonly instructions = new InstructionOpening();
  private readonly where = new Position((step) => this.design.topStepKey(step));
  private design = new SessionDesign();
  private expressionCache = new ExpressionCache();
  private snapshot: StudyManagerSnapshot = INITIAL_SNAPSHOT;

  // --- Coder-level answers (a unit's are with the unit, `Position.unit`) ---

  private userVariableValues: Record<string, VariableValue> = {};
  /** Coder-level answers that can't change any more (`currentFrozen`). */
  private frozen = new Set<string>();

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
  /** The phase an error replaced: shown again when `retry()` starts. */
  private phaseBeforeError: StudyManagerSnapshot["phase"] = "loading";

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
    this.histories = new UnitHistories(coderApi, this.drafts);
    this.queues = new UnitQueues(coderApi, this.outbox);
    this.operations = new Operations<Place>({
      place: () => ({ position: this.where.save(), units: this.histories.indexes() }),
      restore: (place) => this.restore(place),
      republish: () => this.republish(),
      ended: () => this.serverEnded,
      failed: (err, repeat) => this.operationFailed(err, repeat),
      // A save that failed in the background meanwhile
      done: () => this.reportSaveError(),
    });
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

  // --- Starting ---

  /** Loads the session, unless that is underway or done (`start`). */
  private load(): Promise<void> {
    this.starting ??= this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<void> {
    try {
      this.publish({ phase: "loading", error: null, errorCode: null });
      const session = await this.loadSession();
      if (session.ended) await this.showEndedSession(session, session.ended);
      else await this.resume();
    } catch (err) {
      this.starting = null;
      this.showError(err, () => this.load());
    }
  }

  /** Gets the session from the server, and starts from it: its design, the answers so far, what is finished. */
  private async loadSession(): Promise<SessionResponse> {
    let session: SessionResponse = await this.coderApi.getSession();
    this.drafts.sessionId = this.unsent.sessionId = session.sessionId;
    // With the units an earlier visit left unsent, the session is another one: finished units, what is next
    if (await this.sendUnsentUnits()) session = await this.coderApi.getSession();
    this.design = new SessionDesign(session);
    this.frozen = new Set(session.frozen ?? []);
    // The coder-level answers so far (drawn conditions included), so conditions can use them
    Object.assign(this.userVariableValues, session.variables ?? {});
    // (A start that failed halfway may have entered a loop)
    this.where.restart();
    this.histories.restart(session.progress);
    this.publish({
      title: session.codebook.title ?? null,
      display: session.codebook.display ?? {},
      login: session.login ?? null,
      canLogIn: session.canLogIn ?? false,
      signIn: session.signIn ?? "none",
      ...(session.deletionRequest ? { deletionRequested: true } : {}),
      // Told once (the server doesn't repeat it): kept until dismissed
      ...(session.newUnits ? { newUnits: session.newUnits.message } : {}),
    });
    return session;
  }

  /**
   * The coder reached an `end` item before, or quit: shows the ending
   * again, with the values the server still gives for it (endValues).
   */
  private async showEndedSession(
    session: SessionResponse,
    ended: NonNullable<SessionResponse["ended"]>,
  ): Promise<void> {
    this.endedOn = ended.unit ?? null;
    const item = ended.item ? this.design.findEnd(ended.item) : null;
    await this.refreshTopSteps();
    this.publish({ reopen: session.reopen ?? null });
    const scope = endScope(this.design, this.where.coderVisible, session.endValues ?? null);
    await this.publishEnding(item, scope, ended.outcome === "quit");
  }

  /**
   * Goes on where the coder left off: answered questions and finished units
   * are skipped (they stay reachable by navigating back). Back from an end
   * inside a loop (`reopen`): the unit it was reached on.
   */
  private async resume(): Promise<void> {
    const endedOn = this.backFromEnd ? this.endedOn : null;
    this.endedOn = null;
    if (endedOn && (await this.openEndedUnit(endedOn))) {
      this.backFromEnd = false;
      return;
    }
    this.resuming = true;
    await this.advanceTop();
  }

  // --- The unit the coder is in ---

  /** The key of the loop the coder is in ("" outside a loop). */
  private get loopKey(): string {
    return this.where.activeLoop ? this.design.keyOf(this.where.activeLoop) : "";
  }

  /** The history of the loop the coder is in. */
  private get history(): LoopHistory {
    return this.histories.of(this.loopKey);
  }

  /** Whether the unit on screen is one the coder finished before (gone back to). */
  private get onFinishedUnit(): boolean {
    return this.history.entries[this.history.index]?.done ?? false;
  }

  /** Makes a history entry the unit the coder is in (`UnitHistories.load`); its steps follow (`refreshLoopSteps`). */
  private async openEntry(index: number): Promise<OpenUnit> {
    const loop = this.where.activeLoop!;
    const entry = await this.histories.load(this.loopKey, index);
    this.history.index = index;
    const answers = currentAnswers(entry.answers ?? {}, loopVariables(loop), entry.unit.data);
    return this.where.openUnit(entry.unit, answers);
  }

  /** Opens a history entry and shows it at its first or last question. */
  private async showEntry(index: number, at: "first" | "last"): Promise<void> {
    const unit = await this.openEntry(index);
    await this.refreshLoopSteps();
    unit.index = at === "first" ? 0 : lastQuestionIndex(unit.steps);
    await this.publishLoopStep();
  }

  /** Keeps the current unit's answers in its history entry (before leaving it). */
  private syncCurrentUnitAnswers(): void {
    const entry = this.history.entries[this.history.index];
    if (this.where.unit && entry) entry.answers = { ...this.where.unit.answers };
  }

  /**
   * Opens the unit an `end` inside a loop was reached on, at its last
   * question (going back after the end). False if it isn't there any more.
   */
  private async openEndedUnit(target: EndUnit): Promise<boolean> {
    await this.refreshTopSteps();
    const found = this.findUnit(target.loop, target.id);
    if (!found) return false;
    this.goToLoop(found);
    this.where.reachTopStep(found.topIndex);
    const unit = await this.openEntry(found.entry);
    await this.refreshLoopSteps();
    unit.index = lastQuestionIndex(unit.steps);
    this.resuming = false;
    await this.publishLoopStep();
    return true;
  }

  /** Where a unit the coder has is. */
  private findUnit(loopKey: string, unitId: number): FoundUnit | null {
    const topIndex = this.where.topSteps.findIndex(
      (step) => step.type === "unit_loop" && this.design.keyOf(step as CoderUnitLoopItem) === loopKey,
    );
    if (topIndex < 0) return null;
    const entry = this.histories.find(loopKey, unitId);
    return entry < 0 ? null : { topIndex, loop: this.where.topSteps[topIndex] as CoderUnitLoopItem, entry };
  }

  /** In the loop of a unit the coder has, not yet on a unit. */
  private goToLoop(found: FoundUnit): void {
    this.where.topIndex = found.topIndex;
    this.where.leaveLoop();
    this.where.activeLoop = found.loop;
  }

  /**
   * Whether a question of the current unit is answered: the coder can go
   * past it. A wrong answer to a practice question isn't one, until the coder
   * answers right or goes on from the feedback (`continueAfterPractice`).
   */
  private isAnswered(step: DesignItem | undefined): boolean {
    const name = step ? itemName(step) : undefined;
    const { unit } = this.where;
    if (!name || !unit || unit.answers[name] === undefined) return false;
    return !this.practice.isWrong(unit.unit.id, name);
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
    const { unit } = this.where;
    if (unit && (unit.index > 0 || this.history.index > 0)) return true;
    return this.previousTopIndex() >= 0;
  }

  canGoForward(): boolean {
    if (!this.navigable) return false;
    const { unit } = this.where;
    if (unit) {
      const answered = this.isAnswered(unit.steps[unit.index]);
      if (unit.index < unit.steps.length - 1) return answered;
      // The unit's last question: on to the next unit the coder has, once it is answered
      if (this.history.index < this.history.entries.length - 1) return answered;
    }
    return this.where.topIndex < this.where.maxReachedTopIndex;
  }

  async goBack(): Promise<void> {
    await this.operations.guarded(() => this.goBackNow());
  }

  /** `force`: also while loading (going back from the end, `reopen`). */
  private async goBackNow(force = false): Promise<void> {
    if (!force && !this.canGoBack()) return;
    this.syncCurrentUnitAnswers();
    const { unit } = this.where;

    // The previous question of this unit
    if (unit && unit.index > 0) {
      unit.index -= 1;
      await this.publishLoopStep();
      return;
    }

    // The previous unit in the history, at its last question
    if (unit && this.history.index > 0) {
      await this.showEntry(this.history.index - 1, "last");
      return;
    }
    await this.goBackToTopStep();
  }

  /** Back to the previous top-level step: for a loop its last unit (a loop without units is passed). */
  private async goBackToTopStep(): Promise<void> {
    const previous = this.previousTopIndex();
    if (previous < 0) return;
    this.where.topIndex = previous;
    const prevTop = this.where.topSteps[previous];
    this.where.leaveLoop();
    if (prevTop.type === "unit_loop") {
      this.where.activeLoop = prevTop as CoderUnitLoopItem;
      await this.showEntry(this.history.entries.length - 1, "last");
      return;
    }
    await this.publishTopStep(prevTop);
  }

  /** The top-level step going back leads to (a loop only if the coder has units in it); -1: none. */
  private previousTopIndex(): number {
    for (let i = this.where.topIndex - 1; i >= 0; i--) {
      const step = this.where.topSteps[i];
      if (step.type !== "unit_loop") return i;
      if (this.histories.of(this.design.keyOf(step as CoderUnitLoopItem)).entries.length > 0) return i;
    }
    return -1;
  }

  async goForward(): Promise<void> {
    await this.operations.guarded(() => this.goForwardNow());
  }

  private async goForwardNow(): Promise<void> {
    if (!this.canGoForward()) return;
    this.syncCurrentUnitAnswers();
    const { unit } = this.where;

    // The next question of this unit
    if (unit && unit.index < unit.steps.length - 1) {
      unit.index += 1;
      await this.publishLoopStep();
      return;
    }

    // The next unit in the history, at its first question
    if (unit && this.history.index < this.history.entries.length - 1) {
      await this.showEntry(this.history.index + 1, "first");
      return;
    }
    await this.goForwardToTopStep();
  }

  /** On to the next top-level step the coder reached. */
  private async goForwardToTopStep(): Promise<void> {
    if (this.where.topIndex >= this.where.maxReachedTopIndex) return;
    this.where.topIndex += 1;
    const nextTop = this.where.topSteps[this.where.topIndex];
    if (nextTop.type === "unit_loop") {
      await this.enterLoop(nextTop as CoderUnitLoopItem, true);
    } else {
      this.where.leaveLoop();
      await this.publishTopStep(nextTop);
    }
  }

  /** Goes to a unit of the current loop's history. */
  async jumpToUnit(unitIndex: number): Promise<void> {
    await this.operations.guarded(() => this.jumpToUnitNow(unitIndex));
  }

  private async jumpToUnitNow(unitIndex: number): Promise<void> {
    if (!this.where.activeLoop) return;
    this.syncCurrentUnitAnswers();
    const units = this.history.entries.length;
    if (units === 0) return;
    await this.showEntry(Math.max(0, Math.min(unitIndex, units - 1)), "first");
  }

  /** Goes to a question of the current unit: not past unanswered ones. */
  async jumpToLoopStep(stepIndex: number): Promise<void> {
    await this.operations.guarded(() => this.jumpToLoopStepNow(stepIndex));
  }

  private async jumpToLoopStepNow(stepIndex: number): Promise<void> {
    const { unit } = this.where;
    if (!unit || stepIndex < 0 || stepIndex >= unit.steps.length) return;
    const hasUnansweredEarlier = unit.steps.slice(0, stepIndex).some((q) => !this.isAnswered(q));
    if (hasUnansweredEarlier && stepIndex > unit.index) return;
    this.syncCurrentUnitAnswers();
    unit.index = stepIndex;
    await this.publishLoopStep();
  }

  /** Goes to a top-level step the coder reached. */
  async jumpToPhase(phaseIndex: number): Promise<void> {
    await this.operations.guarded(() => this.jumpToPhaseNow(phaseIndex));
  }

  private async jumpToPhaseNow(phaseIndex: number): Promise<void> {
    const { where } = this;
    if (phaseIndex < 0 || phaseIndex >= where.topSteps.length) return;
    if (phaseIndex > where.maxReachedTopIndex) return;
    if (phaseIndex === where.topIndex && where.activeLoop) return;

    this.syncCurrentUnitAnswers();
    where.topIndex = phaseIndex;
    const target = where.topSteps[phaseIndex];

    if (target.type !== "unit_loop") {
      where.leaveLoop();
      await this.publishTopStep(target);
      return;
    }
    where.activeLoop = target as CoderUnitLoopItem;
    // Back to where the coder was in this loop; or, if they haven't been
    // in it during this visit (e.g. resumed session), to the frontier.
    if (this.history.index >= 0) {
      await this.showEntry(Math.min(this.history.index, this.history.entries.length - 1), "first");
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
    await this.operations.guarded(async () => {
      if (!this.isOnScreen(item.name, unitId)) return;
      this.timeAnswer(item.name, value);
      if (this.where.activeLoop === null) await this.answerCoderQuestion(item.name, value);
      else await this.answerUnitQuestion(item.name, value);
    });
  }

  /** Whether a question (of a unit, or coder-level: `unitId` null) is the one on screen. */
  private isOnScreen(name: string, unitId: number | null): boolean {
    const now = this.snapshot.currentItem;
    return now?.type === "question" && now.name === name && (this.snapshot.currentUnit?.id ?? null) === unitId;
  }

  /** The answers of the level the coder is on: coder-level, or the unit's. */
  private get answersOnScreen(): Record<string, VariableValue> {
    return this.where.activeLoop === null ? this.userVariableValues : (this.where.unit?.answers ?? {});
  }

  /** The question on screen is answered: its time is taken, and whether the answer changed. */
  private timeAnswer(name: string, value: VariableValue): void {
    const key = this.timingKey(name);
    if (key) this.timer.answered(key, JSON.stringify(this.answersOnScreen[name]) !== JSON.stringify(value));
    this.timer.leave();
  }

  private async answerCoderQuestion(name: string, value: VariableValue): Promise<void> {
    // A frozen answer stays as it is (the server ignores another one).
    if (!this.frozen.has(name)) this.userVariableValues[name] = value;
    const values = await this.postedCoderValues();
    const timings = this.timer.take("c:");
    this.save({ key: "coder", send: () => this.coderApi.postCoderVariables(values, timings) });
    await this.operations.retryFrom(() => this.advanceTop());
  }

  private async answerUnitQuestion(name: string, value: VariableValue): Promise<void> {
    const { unit } = this.where;
    if (!unit) return;
    unit.answers[name] = value;
    this.dropAnswersBuiltOn(unit, name);
    this.writeDraft();
    if (!(await this.checkPractice(unit, name, value))) return;
    await this.operations.retryFrom(() => this.advanceUnit());
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
    await this.operations.guarded(async () => {
      if (!this.isOnScreen(name, unitId)) return;
      const answer = this.answersOnScreen[name];
      if (!answer || (answer.comment ?? "") === comment) return;
      const { unit } = this.where;
      if (unit) this.commentOnUnitAnswer(unit, name, withComment(answer, comment));
      else await this.commentOnCoderAnswer(name, withComment(answer, comment));
    });
  }

  private async commentOnCoderAnswer(name: string, answer: VariableValue): Promise<void> {
    if (this.frozen.has(name)) return;
    this.userVariableValues[name] = answer;
    const values = await this.postedCoderValues();
    this.save({ key: "coder", send: () => this.coderApi.postCoderVariables(values, {}) });
  }

  private commentOnUnitAnswer(unit: OpenUnit, name: string, answer: VariableValue): void {
    unit.answers[name] = answer;
    if (unit.visible[name]) unit.visible[name] = answer;
    this.writeDraft();
    this.syncCurrentUnitAnswers();
    if (this.onFinishedUnit) this.saveFinishedUnit();
  }

  /** The timer's key for a question on screen now (`QuestionTimer`): coder-level, or in the current unit. */
  private timingKey(name: string): string | null {
    if (this.where.activeLoop === null) return `c:${name}`;
    return this.where.unit ? `u:${this.where.unit.unit.id}:${name}` : null;
  }

  /**
   * The unit's other answers that no longer fit after this one changed (a
   * relation to a span the coder removed, an option that was that span) are
   * dropped: the coder is asked again, and until then they are saved as
   * skipped. The server refuses a unit with such an answer.
   */
  private dropAnswersBuiltOn({ unit, answers }: OpenUnit, changed: string): void {
    const fitting = currentAnswers(answers, loopVariables(this.where.activeLoop!), unit.data);
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
    const { visible } = await computeTopLevelSteps(this.design.stepItems, this.userVariableValues, this.stepContext);
    const fitting = Object.entries(this.userVariableValues).filter(([name, value]) => {
      const variable = this.design.coderQuestions.get(name);
      return variable !== undefined && validateAnswer(name, variable, value).length === 0;
    });
    return Object.fromEntries(
      fitting.map(([name, value]) => [name, name in visible ? value : { done: true, skip: true }]),
    );
  }

  // --- Practice units (docs/architecture.md §6.2) ---

  /**
   * A practice unit's question, checked as it is answered: right flashes a
   * check; wrong shows the feedback with the question. Returns whether the
   * coder goes on now: right, or a question without a check. After a wrong
   * answer without `retry` the coder goes on with `continueAfterPractice`.
   */
  private async checkPractice(open: OpenUnit, name: string, value: VariableValue): Promise<boolean> {
    const { unit } = open;
    const result = this.practice.check(unit, name, value);
    if (!result) return true;
    if (result.right) {
      this.publish({ practiceWrong: null, practiceRight: this.snapshot.practiceRight + 1 });
      return true;
    }
    const question = { name, variable: this.design.questions.get(name), key: result.key };
    const scope = this.design.scope(open.answers, unitScopeData(unit) as UnitData);
    const message = await renderPracticeFeedback(unit, question, scope, this.expressionCache);
    // Shown again (the question stays): the field starts from the wrong answer
    this.syncCurrentUnitAnswers();
    await this.publishLoopStep({ reopen: false });
    const retry = unit.practice?.retry ?? false;
    this.publish({ practiceWrong: { unitId: unit.id, question: name, messages: [message], retry } });
    return false;
  }

  /** A wrong practice answer without `retry`: the coder goes on with their answer. */
  async continueAfterPractice(): Promise<void> {
    const wrong = this.snapshot.practiceWrong;
    if (!wrong || wrong.retry || this.where.unit?.unit.id !== wrong.unitId) return;
    this.practice.solve(wrong.unitId, wrong.question);
    this.publish({ practiceWrong: null });
    await this.operations.guarded(() => this.advanceUnit());
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
   * far as they fit (`UnitHistories.carry`). Returns whether there were any.
   */
  private async sendUnsentUnits(): Promise<boolean> {
    // (Starting again in the same visit: what waits is in the outbox)
    const posts = this.outbox.waiting.length === 0 ? this.unsent.read() : [];
    for (const post of posts) {
      try {
        await this.coderApi.postUnitVariables(post.unitId, post.answers, post.loop, post.timings);
      } catch (err) {
        if (isTransient(err)) throw err;
        this.histories.carry(post.loop, post.unitId, post.answers);
      }
    }
    this.unsent.write([]);
    return posts.length > 0;
  }

  /**
   * Saving failed in the background. While the coder's last action is still
   * being handled, that action meets the error itself (`Operations`).
   * Otherwise: a new design version loads the session again
   * (`reloadAfterPublish`); another error shows, and `retry()` saves again.
   */
  private reportSaveError(): void {
    const err = this.outbox.error;
    if (err === null || this.operations.running || this.snapshot.phase === "error") return;
    if (errorCodeOf(err) === "design_changed") {
      void this.operations.guarded(() => this.reloadAfterPublish());
      return;
    }
    this.showError(err, () => this.outbox.flush());
    this.publish({ retrying: false });
  }

  // --- Errors and Retry ---

  /** Shows an error instead of the step the coder is on; `retry()` then runs `repeat`. */
  private showError(err: unknown, repeat: () => Promise<void>): void {
    if (this.snapshot.phase !== "error") this.phaseBeforeError = this.snapshot.phase;
    this.operations.repeatOnRetry(repeat);
    // A unit the server refused: the coder can also go back to it (`backToRefusedUnit`)
    const refused = err === this.outbox.error && isRefusal(err) ? this.outbox.failed?.unit : undefined;
    this.publish({
      phase: "error",
      ...errorFields(err),
      refusedUnit: refused ? { loop: refused.loop, unitId: refused.unitId } : null,
    });
  }

  /**
   * An operation failed (the coder is back where they were): a new design
   * version (`design_changed`) loads the session again; another failure
   * shows as an error that `retry()` repeats.
   */
  private async operationFailed(err: unknown, repeat: () => Promise<void>): Promise<void> {
    if (errorCodeOf(err) === "design_changed") await this.reloadAfterPublish();
    else this.showError(err, repeat);
  }

  private restore(place: Place): void {
    this.where.restore(place.position);
    this.histories.restoreIndexes(place.units);
  }

  /**
   * Repeats what failed (the operation, or the part of it that was still to
   * do), from the step the coder was on, and tries saving again.
   */
  async retry(): Promise<void> {
    const repeat = this.operations.takeRepeat();
    if (!repeat) return;
    this.outbox.error = null;
    await this.operations.guarded(repeat, true);
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
    await this.operations.guarded(async () => {
      const found = this.findUnit(refused.loop, refused.unitId);
      if (!found) return;
      this.outbox.dropFailed();
      this.operations.repeatOnRetry(null);
      this.goToLoop(found);
      this.history.entries[found.entry].done = false;
      await this.openAtFirstOpenStep(found.entry);
    });
  }

  /** Shows the step the coder is on again (after an error): the question, else what was there (the ending). */
  private async republish(): Promise<void> {
    const top = this.where.topSteps[this.where.topIndex];
    if (this.where.unit) await this.publishLoopStep();
    else if (!this.where.activeLoop && top?.type === "question") await this.publishTopStep(top);
    else this.publish({ phase: this.phaseBeforeError });
  }

  // --- A new design version ---

  /**
   * A new design version was deployed while the coder was working (the
   * server answered `design_changed`): load the session again, as after a
   * reload, so the coder continues where they were under the new version.
   * Unsaved answers to units come back with their units, if they still fit;
   * unsaved coder-level answers are asked again.
   */
  private async reloadAfterPublish(): Promise<void> {
    this.carryUnsavedUnits();
    this.outbox.clear();
    // A practice question's feedback belongs to the unit, which is served again
    this.publish({ practiceWrong: null });
    this.queues.clear();
    this.starting = null;
    this.userVariableValues = {};
    this.where.leaveLoop();
    this.expressionCache = new ExpressionCache();
    await this.load();
  }

  /** Keeps the answers to every unit that isn't saved: started and not finished, or finished and still to be sent. */
  private carryUnsavedUnits(): void {
    this.syncCurrentUnitAnswers();
    this.histories.carryUnfinished();
    for (const { unit } of this.outbox.waiting) {
      if (unit) this.histories.carry(unit.loop, unit.unitId, unit.answers);
    }
  }

  /**
   * After a new design version: the finished units of the loop whose changed
   * answers weren't saved are saved again, as far as the answers still fit.
   */
  private async saveCarriedUnits(): Promise<void> {
    const loopKey = this.loopKey;
    for (const [index, entry] of this.history.entries.entries()) {
      if (!entry.done || !this.histories.isCarried(loopKey, entry.unitId)) continue;
      await this.openEntry(index);
      await this.refreshLoopSteps();
      this.saveFinishedUnit();
    }
  }

  /** The coder read the new units message. */
  dismissNewUnits(): void {
    this.publish({ newUnits: null });
  }

  // --- Steps and rendering ---

  private get stepContext(): StepContext {
    return { questions: this.design.questions, cache: this.expressionCache, session: this.design.session };
  }

  private async refreshTopSteps(): Promise<void> {
    const { steps, visible } = await computeTopLevelSteps(
      this.design.stepItems,
      this.userVariableValues,
      this.stepContext,
    );
    this.where.setTopSteps(steps, visible);
  }

  /** The steps of the unit the coder is in, as its answers show them now. */
  private async refreshLoopSteps(): Promise<void> {
    const { activeLoop, coderVisible, unit } = this.where;
    if (!activeLoop || !unit) return;
    const data = unitScopeData(unit.unit) as UnitData;
    const steps = await computeLoopSteps(activeLoop, coderVisible, unit.answers, data, this.stepContext);
    unit.steps = steps.steps;
    unit.layouts = steps.layouts;
    unit.visible = steps.visible;
  }

  /**
   * Publishes the current step of the current unit, with the layout and texts
   * rendered. `reopen: false`: the question is shown again (a wrong practice
   * answer), its instruction doesn't open by itself again.
   */
  private async publishLoopStep({ reopen = true }: { reopen?: boolean } = {}): Promise<void> {
    const { activeLoop: loop, unit: open } = this.where;
    if (!loop || !open) return;
    const { unit } = open;
    const loopKey = this.design.keyOf(loop);
    const step: DesignItem | undefined = open.steps[open.index];
    const view: LoopStep = { loop, loopKey, step, layout: open.layouts[open.index] ?? null };
    const scope = this.design.scope(open.visible, unitScopeData(unit) as UnitData);
    const opens = () =>
      reopen && step !== undefined && this.instructions.opens(step, loopKey, unit, this.histories.doneUnitIds(loopKey));
    const [template, texts] = await Promise.all([
      renderUnitLayout(view, scope, this.expressionCache),
      renderLoopQuestionTexts(view, scope, this.expressionCache, opens),
    ]);
    this.publish({
      phase: "unit_variable",
      currentItem: step,
      currentUnit: unit,
      currentUnitLayout: view.layout,
      currentLoopVariables: loopVariables(loop),
      currentUnitTemplate: template,
      currentTexts: texts,
      currentUnitVariables: { ...open.answers },
      currentFrozen: false,
      // (Feedback on a wrong practice answer is for the step it was given on: `checkPractice` shows it after this)
      practiceWrong: null,
    });
  }

  /** Publishes a top-level (coder-level) question. */
  private async publishTopStep(item: DesignItem): Promise<void> {
    const scope = this.design.scope(this.where.coderVisible);
    const texts = await renderQuestionTexts(item, scope, this.expressionCache);
    this.publish({
      ...NO_STEP,
      phase: "user_variable",
      currentItem: item,
      currentTexts: texts,
      currentFrozen: "name" in item && this.frozen.has(item.name),
      practiceWrong: null,
    });
  }

  /** Keeps the answers to the unit on screen in the browser (`UnitDraftStore`), until the unit is finished. */
  private writeDraft(): void {
    const { unit } = this.where;
    // Not for practice units: a restored answer would skip its check
    if (!unit || unit.unit.practice) return;
    // A finished unit (gone back to) is saved again at once (`advanceUnit`)
    if (this.onFinishedUnit) return;
    this.drafts.write({ loop: this.loopKey, unitId: unit.unit.id, answers: unit.answers });
  }

  // --- The end of the session ---

  /**
   * The coder reached an `end` item (inside a unit loop: on `unit`), or
   * without one the end of the study: tells the server, and shows the ending.
   */
  private async reachEnd(item: EndItem | null, scope: ReferenceScope, unit?: EndUnit): Promise<void> {
    // (If it fails, `retry()` ends the session: the steps that led here aren't taken again.)
    await this.operations.retryFrom(async () => {
      // Everything is saved before the session ends (the server accepts nothing after).
      await this.outbox.flush();
      const ended = await this.coderApi.endSession(item?.name, unit);
      this.endedOn = unit ?? null;
      this.publish({ reopen: ended?.reopen ?? null });
      await this.publishEnding(item, scope);
    });
  }

  /**
   * Goes back after finishing (while `reopen` allows): the server opens the
   * session again, and the coder lands on their last question.
   */
  async reopen(): Promise<void> {
    await this.operations.guarded(async () => {
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
    await this.operations.guarded(async () => {
      await this.outbox.flush();
      await this.coderApi.quitSession(requestDeletion);
      if (requestDeletion) this.publish({ deletionRequested: true });
      if (this.snapshot.phase !== "finished") {
        await this.publishEnding(null, this.design.scope(this.where.coderVisible), true);
      }
    });
  }

  /** Publishes the finished phase; with an `end` item, its message and redirect. */
  private async publishEnding(item: EndItem | null, scope: ReferenceScope, quit = false): Promise<void> {
    const ending = item ? await renderEnding(item, scope, this.expressionCache) : null;
    this.where.leaveLoop();
    this.drafts.clearAll();
    this.publish({ ...NO_STEP, phase: "finished", practiceWrong: null, ending, quit });
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
    void this.operations.guarded(() =>
      this.publishEnding(this.design.findEnd(name), this.design.scope(this.where.coderVisible)),
    );
  }

  // --- Moving on after an answer ---

  /** The next top-level step: skips answered questions while resuming, asks the server for experiments' conditions. */
  private async advanceTop(): Promise<void> {
    await this.refreshTopSteps();
    this.where.topIndex += 1;
    this.where.reachTopStep(this.where.topIndex);
    const next = this.where.topSteps[this.where.topIndex];

    // Back from the end (`reopen`): the last question instead of ending again.
    if (this.backFromEnd && (!next || next.type === "end")) {
      this.backFromEnd = false;
      this.resuming = false;
      await this.goBackNow(true);
      return;
    }
    if (!next || next.type === "end") {
      await this.reachEnd(next ?? null, this.design.scope(this.where.coderVisible));
      return;
    }
    if (next.type === "unit_loop") {
      await this.enterLoop(next as CoderUnitLoopItem);
      return;
    }
    if (next.type === "experiment") {
      await this.assignCondition(next.name);
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
   * An experiment without a value: an invisible step. The server computes
   * it now (the answers it may balance on saved first), and the flow goes on with it.
   */
  private async assignCondition(name: string): Promise<void> {
    await this.outbox.flush();
    this.userVariableValues[name] = await this.coderApi.assignCondition(name);
    this.where.topIndex -= 1;
    await this.advanceTop();
  }

  /** The next question of the unit; after its last, saves the unit and moves on (`continueAfterUnit`). */
  private async advanceUnit(): Promise<void> {
    if (!this.where.activeLoop) return;
    const { unit } = this.where;
    if (!unit) {
      await this.nextUnitAtFrontier();
      return;
    }

    await this.refreshLoopSteps();
    unit.index += 1;
    const next: DesignItem | undefined = unit.steps[unit.index];
    if (next && next.type !== "end") {
      // A finished unit (gone back to): a changed answer is saved now. Coders who change an answer
      // often leave the unit without answering the rest again; a question the change now shows is
      // saved as skipped until they answer it.
      if (this.onFinishedUnit) this.saveFinishedUnit();
      await this.publishLoopStep();
      return;
    }
    this.saveFinishedUnit();
    // (If going on fails, `retry()` goes on: the unit isn't saved again.)
    await this.operations.retryFrom(() => this.continueAfterUnit(next));
  }

  /**
   * The unit is finished: posts an answer for every question of the loop,
   * `skip` for those a condition hides (also an answer to a question an
   * earlier answer now hides), since the server only accepts complete units
   * (docs/architecture.md §8.2).
   */
  private saveFinishedUnit(): void {
    const loop = this.where.activeLoop!;
    const { unit, visible } = this.where.unit!;
    const doneValues: Record<string, VariableValue> = {};
    for (const name of loopVariables(loop).keys()) {
      const value = visible[name];
      doneValues[name] = value ? { ...value, done: true } : { done: true, skip: true };
    }
    const timings = this.timer.take(`u:${unit.id}:`);
    // Practice questions: how many tries it took (1: right the first time)
    for (const [name, tries] of this.practice.takeTries(unit.id)) {
      if (timings[name]) timings[name] = { ...timings[name], tries };
    }
    const loopKey = this.loopKey;
    this.saveUnit({ loop: loopKey, unitId: unit.id, answers: doneValues, timings });
    for (const name of this.design.dependenciesOf(loopKey)) {
      if (name in this.userVariableValues) this.frozen.add(name);
    }
    const entry = this.history.entries[this.history.index];
    if (entry) {
      entry.answers = { ...doneValues };
      entry.done = true;
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
    const { activeLoop, unit } = this.where;
    if (activeLoop && unit) {
      // An `end` item in the loop: the unit is saved, then the session ends.
      if (next?.type === "end") {
        const scope = this.design.scope(unit.visible, unitScopeData(unit.unit) as UnitData);
        await this.reachEnd(next, scope, { loop: this.loopKey, id: unit.unit.id });
        return;
      }
      // Reviewing an earlier unit: on to the next unit in the history
      if (await this.showNextHistoryUnit()) return;
      this.where.unit = null;
    }
    // The first unit the coder started and didn't finish (they went back from it), else a new one
    const unfinished = this.where.activeLoop ? this.history.entries.findIndex((entry) => !entry.done) : -1;
    if (unfinished >= 0) await this.openAtFirstOpenStep(unfinished);
    else await this.nextUnitAtFrontier();
  }

  /** Shows the unit after this one in the history, at its first question. False: there is none (or it has no steps). */
  private async showNextHistoryUnit(): Promise<boolean> {
    if (this.history.index >= this.history.entries.length - 1) return false;
    const unit = await this.openEntry(this.history.index + 1);
    await this.refreshLoopSteps();
    unit.index = 0;
    if (!unit.steps[0]) return false;
    await this.publishLoopStep();
    return true;
  }

  /** The next unit from the server; without one, the loop is done and the next top-level step follows. */
  private async nextUnitAtFrontier(): Promise<void> {
    if (!this.where.activeLoop) return;
    const loopKey = this.loopKey;
    const nextUnit = await this.queues.next(loopKey, (unitId) => this.histories.find(loopKey, unitId) >= 0);
    if (!nextUnit) {
      this.where.leaveLoop();
      await this.advanceTop();
      return;
    }
    this.histories.push(loopKey, nextUnit);
    await this.openAtFirstOpenStep(this.history.entries.length - 1);
  }

  /**
   * Opens a unit of the coder's history at its first question without a
   * (still valid) answer: the unit may be partly done (reload mid-unit, the
   * coder went back from it, or the codebook gained a question). `atStart`:
   * at its first question instead.
   */
  private async openAtFirstOpenStep(index: number, atStart = false): Promise<void> {
    const unit = await this.openEntry(index);
    await this.refreshLoopSteps();
    unit.index = atStart ? 0 : this.firstOpenIndex(unit);
    if (!unit.steps[unit.index]) {
      // A unit without steps (conditions hide them all): move past it.
      unit.index = -1;
      await this.advanceUnit();
      return;
    }

    this.resuming = false;
    await this.publishLoopStep();
  }

  /** A unit's first question without an answer; all answered: its last question. */
  private firstOpenIndex(unit: OpenUnit): number {
    const firstOpen = unit.steps.findIndex((step) => !this.isAnswered(step));
    return firstOpen === -1 ? lastQuestionIndex(unit.steps) : firstOpen;
  }

  /**
   * Moving forward into a loop (the coder answered the question before it,
   * or pressed next): its unit the coder started but didn't finish, if any
   * (they went back from it), else the next unit from the server. `atStart`
   * (next): at that unit's first question, else at its first unanswered one.
   */
  private async enterLoop(loop: CoderUnitLoopItem, atStart = false): Promise<void> {
    this.where.leaveLoop();
    this.where.activeLoop = loop;
    if (this.histories.carrying) await this.saveCarriedUnits();
    const unfinished = this.history.entries.findIndex((entry) => !entry.done);
    if (unfinished >= 0) await this.openAtFirstOpenStep(unfinished, atStart);
    else await this.nextUnitAtFrontier();
  }

  // --- Publishing ---

  private buildNavigation(): StudyManagerNavigation {
    const { where } = this;
    return navigationSnapshot({
      topSteps: where.topSteps,
      topIndex: where.topIndex,
      maxReachedTopIndex: where.maxReachedTopIndex,
      canGoBack: this.canGoBack(),
      canGoForward: this.canGoForward(),
      inLoop: where.activeLoop !== null,
      currentUnitIndex: where.activeLoop ? this.history.index : undefined,
      loop: (loop) => {
        const key = this.design.keyOf(loop);
        return { key, history: this.histories.of(key), totalUnits: this.histories.totalUnits(key) };
      },
      questions: where.unit ? reachedQuestions(where.unit, (step) => this.isAnswered(step)) : [],
    });
  }

  private publish(next: Partial<StudyManagerSnapshot>): void {
    // After the server ended the session, its ending stays on screen
    if (this.serverEnded && this.snapshot.phase === "finished" && next.phase !== undefined && next.phase !== "finished")
      return;
    // Navigation (canGoBack etc.) depends on the new phase, so set that first.
    this.snapshot = { ...this.snapshot, userVariableValues: { ...this.userVariableValues }, ...next };
    this.snapshot = { ...this.snapshot, navigation: this.buildNavigation() };
    this.timeQuestionOnScreen();
    for (const listener of this.listeners) listener();
  }

  /** The question on screen is timed while it is there. */
  private timeQuestionOnScreen(): void {
    const { phase, currentItem, currentUnit } = this.snapshot;
    const name = currentItem && itemName(currentItem);
    if (phase === "user_variable" && name) this.timer.show(`c:${name}`);
    else if (phase === "unit_variable" && name && currentUnit) this.timer.show(`u:${currentUnit.id}:${name}`);
    else this.timer.leave();
  }
}
