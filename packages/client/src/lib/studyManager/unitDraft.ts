import type { VariableValue } from "@annotinder/contracts";

/** The answers given so far to the unit on screen. */
export interface UnitDraft {
  loop: string;
  unitId: number;
  answers: Record<string, VariableValue>;
}

/**
 * The answers to the unit on screen, kept in the browser (localStorage) as
 * they are given: a coder who closes the page mid-unit finds them back when
 * the unit comes again. One draft per coder session; StudyManager clears it
 * once the unit is saved or the session ends. Storage that fails (private
 * mode, full) just keeps no draft.
 */
export class UnitDraftStore {
  /** The coder session (from the server) the draft belongs to; none until the session is loaded. */
  sessionId: number | null = null;

  private get key(): string | null {
    return this.sessionId === null ? null : `annotinder:unit-draft:${this.sessionId}`;
  }

  write(draft: UnitDraft): void {
    const key = this.key;
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // No draft then
    }
  }

  read(): UnitDraft | null {
    const key = this.key;
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Clears the draft (only if it is for `unitId`, when given). */
  clear(unitId?: number): void {
    const key = this.key;
    if (!key) return;
    try {
      if (unitId === undefined || this.read()?.unitId === unitId) localStorage.removeItem(key);
    } catch {
      // Nothing to clear
    }
  }
}
