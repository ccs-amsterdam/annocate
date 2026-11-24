import type { VariableValue } from "@annotinder/contracts";

/** The answers given so far to a unit the coder hasn't finished. */
export interface UnitDraft {
  loop: string;
  unitId: number;
  answers: Record<string, VariableValue>;
}

/** Drafts kept per session: a coder has few unfinished units (the one on screen, and those they went back from). */
const MAX_DRAFTS = 20;

/**
 * The answers to units the coder started and didn't finish, kept in the
 * browser (localStorage) as they are given: a coder who closes the page
 * mid-unit finds them back when the unit comes again. One draft per unit
 * (`<loop>/<unitId>`), together under one key per coder session;
 * StudyManager clears a unit's draft once the unit is saved, and all of them
 * when the session ends. Storage that fails (private mode, full) just keeps
 * no drafts.
 */
export class UnitDraftStore {
  /** The coder session (from the server) the drafts belong to; none until the session is loaded. */
  sessionId: number | null = null;

  private get key(): string | null {
    return this.sessionId === null ? null : `annotinder:unit-drafts:${this.sessionId}`;
  }

  write({ loop, unitId, answers }: UnitDraft): void {
    const drafts = this.readAll();
    // (Written again: the newest draft is the last one)
    delete drafts[`${loop}/${unitId}`];
    drafts[`${loop}/${unitId}`] = answers;
    const kept = Object.entries(drafts).slice(-MAX_DRAFTS);
    this.writeAll(Object.fromEntries(kept));
  }

  /** The draft of a unit, if there is one. */
  read(loop: string, unitId: number): Record<string, VariableValue> | null {
    return this.readAll()[`${loop}/${unitId}`] ?? null;
  }

  /** Clears a unit's draft (the unit was saved). */
  clear(loop: string, unitId: number): void {
    const drafts = this.readAll();
    if (!(`${loop}/${unitId}` in drafts)) return;
    delete drafts[`${loop}/${unitId}`];
    this.writeAll(drafts);
  }

  /** Clears every draft (the session ended). */
  clearAll(): void {
    this.writeAll({});
  }

  private readAll(): Record<string, Record<string, VariableValue>> {
    const key = this.key;
    if (!key) return {};
    try {
      const drafts: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
      return drafts && typeof drafts === "object" ? (drafts as Record<string, Record<string, VariableValue>>) : {};
    } catch {
      return {};
    }
  }

  private writeAll(drafts: Record<string, Record<string, VariableValue>>): void {
    const key = this.key;
    if (!key) return;
    try {
      if (Object.keys(drafts).length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(drafts));
    } catch {
      // No drafts then
    }
  }
}
