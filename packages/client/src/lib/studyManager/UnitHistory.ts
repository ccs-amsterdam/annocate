import type { CoderUnitResponse, SessionResponse, VariableValue } from "@annotinder/contracts";
import type { CoderApi } from "../api/httpCoderApi";
import type { UnitDraftStore } from "./unitDraft";

/**
 * A unit in a loop's history. Units finished in an earlier visit (resumed
 * session) start as just an id; content and answers are loaded when the
 * coder navigates to them.
 */
export interface UnitHistoryEntry {
  unitId: number;
  unit: CoderUnitResponse | null;
  answers: Record<string, VariableValue> | null;
  /** The coder finished the unit (its answers were sent), now or in an earlier visit. */
  done: boolean;
}

/** A unit of a history with its content loaded. */
export type LoadedEntry = UnitHistoryEntry & { unit: CoderUnitResponse };

export interface LoopHistory {
  entries: UnitHistoryEntry[];
  /** The unit the coder is on; -1: none (not in the loop during this visit). */
  index: number;
}

type Answers = Record<string, VariableValue>;

/**
 * Per unit loop (by its key): the units the coder has seen in this session
 * (plus, after a resume, those finished earlier), and their answers.
 */
export class UnitHistories {
  private histories = new Map<string, LoopHistory>();
  /** Per loop: finished unit ids and expected total, from the session. */
  private progress = new Map<string, SessionResponse["progress"][number]>();
  /**
   * After a new design version: answers to units that weren't saved yet
   * (units the coder started and didn't finish, and finished units still to
   * be sent), by `<loop>/<unitId>`, put back when the reloaded session has
   * the unit again.
   */
  private carryOver = new Map<string, Answers>();

  constructor(
    private readonly coderApi: Pick<CoderApi, "getLoopUnit">,
    private readonly drafts: UnitDraftStore,
  ) {}

  /** A session is loaded: the histories start from what it says is finished. */
  restart(progress: SessionResponse["progress"]): void {
    this.histories.clear();
    this.progress = new Map(progress.map((p) => [p.loop, p]));
  }

  of(loopKey: string): LoopHistory {
    let history = this.histories.get(loopKey);
    if (!history) {
      const entries = this.doneUnitIds(loopKey).map((unitId) => ({ unitId, unit: null, answers: null, done: true }));
      this.histories.set(loopKey, (history = { entries, index: -1 }));
    }
    return history;
  }

  /** The units of a loop the coder finished before this visit started. */
  doneUnitIds(loopKey: string): number[] {
    return this.progress.get(loopKey)?.doneUnitIds ?? [];
  }

  /** How many units the coder will get in a loop, if the server knows. */
  totalUnits(loopKey: string): number | undefined {
    return this.progress.get(loopKey)?.totalUnits ?? undefined;
  }

  /**
   * A unit of a history with its content, loaded from the server if needed
   * (a unit finished in an earlier visit), with the answers it had before a
   * new design version, if those weren't saved.
   */
  async load(loopKey: string, index: number): Promise<LoadedEntry> {
    const entry = this.of(loopKey).entries[index];
    if (!entry.unit) {
      const unit = await this.coderApi.getLoopUnit(loopKey, entry.unitId);
      entry.unit = unit;
      entry.answers = { ...(unit.variables ?? {}), ...this.takeCarried(loopKey, unit.id) };
    }
    return entry as LoadedEntry;
  }

  /**
   * Adds a unit just fetched from the server to its loop's history, with any
   * answers it had before a reload (the browser's draft) or a new design
   * version: those are newer than what the server has.
   */
  push(loopKey: string, unit: CoderUnitResponse): void {
    const draft = this.drafts.read(loopKey, unit.id);
    const carried = this.takeCarried(loopKey, unit.id);
    const answers = { ...(unit.variables ?? {}), ...draft, ...carried };
    this.of(loopKey).entries.push({ unitId: unit.id, unit, answers, done: false });
  }

  /** Where a unit is in its loop's history; -1 if the coder doesn't have it. */
  find(loopKey: string, unitId: number): number {
    return this.of(loopKey).entries.findIndex((entry) => entry.unitId === unitId);
  }

  // --- Answers kept over a new design version ---

  /** Whether any answers are waiting for their unit to come again. */
  get carrying(): boolean {
    return this.carryOver.size > 0;
  }

  carry(loopKey: string, unitId: number, answers: Answers): void {
    this.carryOver.set(`${loopKey}/${unitId}`, answers);
  }

  isCarried(loopKey: string, unitId: number): boolean {
    return this.carryOver.has(`${loopKey}/${unitId}`);
  }

  /** Keeps the answers to every unit the coder started and didn't finish. */
  carryUnfinished(): void {
    for (const [loopKey, history] of this.histories) {
      for (const entry of history.entries) {
        if (!entry.done && entry.answers) this.carry(loopKey, entry.unitId, entry.answers);
      }
    }
  }

  /** The answers kept for a unit: given once. */
  private takeCarried(loopKey: string, unitId: number): Answers {
    const key = `${loopKey}/${unitId}`;
    const answers = this.carryOver.get(key) ?? {};
    this.carryOver.delete(key);
    return answers;
  }

  // --- Which unit the coder is on, per loop (`Operations` puts it back after a failure) ---

  indexes(): Map<string, number> {
    return new Map([...this.histories].map(([key, history]) => [key, history.index]));
  }

  restoreIndexes(indexes: Map<string, number>): void {
    // (A loop first entered in the failed operation: not on any unit of it)
    for (const [key, history] of this.histories) history.index = indexes.get(key) ?? -1;
  }
}
