import type { AnswerTiming } from "@annotinder/contracts";

/** The contract's bound on a measured time: longer is noise (contracts AnswerTimingSchema). */
const MAX_MS = 24 * 60 * 60 * 1000;

interface Entry {
  firstMs: number | null;
  totalMs: number;
  hiddenMs: number;
  edits: number;
  /** Time was added since the timing was last sent. */
  dirty: boolean;
}

/**
 * How long a coder takes per question (docs/coder-identity.md §10): the
 * time a question is on screen, over all its visits, apart from time the
 * page is hidden (another tab, a minimized window), which is counted
 * separately. Waiting for the server isn't counted: `leave()` before
 * posting, `show()` once the next question is on screen. Keys name a
 * question: `c:<name>` for coder-level ones, `u:<unitId>:<name>` in units.
 */
export class QuestionTimer {
  private entries = new Map<string, Entry>();
  private current: string | null = null;
  /** Since when the current question has been on screen (visible), or hidden. */
  private since = 0;
  private hidden = false;

  constructor(private readonly now: () => number = () => performance.now()) {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => this.visibility(document.visibilityState === "hidden"));
    }
  }

  /** A question is on screen (the same key again: no change). */
  show(key: string): void {
    if (key === this.current) return;
    this.leave();
    this.current = key;
    this.since = this.now();
  }

  /** No question is on screen any more (answered, an ending, an error). */
  leave(): void {
    if (this.current === null) return;
    this.add(this.entry(this.current));
    this.current = null;
  }

  /** The question on screen was answered; `changed`: with another answer than it had. */
  answered(key: string, changed: boolean): void {
    const entry = this.entry(key);
    if (key === this.current) {
      this.add(entry);
      this.since = this.now();
    }
    if (entry.firstMs === null) entry.firstMs = entry.totalMs;
    if (changed) entry.edits += 1;
    entry.dirty = true;
  }

  /** The timings of the questions under `prefix` that changed since the last call, by the rest of their key. */
  take(prefix: string): Record<string, AnswerTiming> {
    const out: Record<string, AnswerTiming> = {};
    for (const [key, entry] of this.entries) {
      if (!entry.dirty || !key.startsWith(prefix)) continue;
      entry.dirty = false;
      const ms = (v: number) => Math.min(MAX_MS, Math.round(v));
      out[key.slice(prefix.length)] = {
        firstMs: entry.firstMs === null ? null : ms(entry.firstMs),
        totalMs: ms(entry.totalMs),
        hiddenMs: ms(entry.hiddenMs),
        edits: Math.min(10_000, entry.edits),
      };
    }
    return out;
  }

  /** The page was hidden or shown again. */
  visibility(hidden: boolean): void {
    if (hidden === this.hidden) return;
    if (this.current !== null) {
      this.add(this.entry(this.current));
      this.since = this.now();
    }
    this.hidden = hidden;
  }

  private add(entry: Entry): void {
    const elapsed = Math.max(0, this.now() - this.since);
    if (this.hidden) entry.hiddenMs += elapsed;
    else entry.totalMs += elapsed;
    entry.dirty = true;
  }

  private entry(key: string): Entry {
    let entry = this.entries.get(key);
    if (!entry) this.entries.set(key, (entry = { firstMs: null, totalMs: 0, hiddenMs: 0, edits: 0, dirty: false }));
    return entry;
  }
}
