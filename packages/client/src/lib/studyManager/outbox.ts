import type { AnswerTiming, VariableValue } from "@annotinder/contracts";
import { isTransient } from "./errors";

/** A finished unit as it is posted: its answers, and how long they took. */
export interface UnitPost {
  loop: string;
  unitId: number;
  answers: Record<string, VariableValue>;
  timings: Record<string, AnswerTiming>;
}

/** Answers waiting to be saved. */
export interface OutboxItem {
  /** What it saves: a newer item with the same key replaces one still waiting. */
  key: string;
  send: () => Promise<unknown>;
  /** A finished unit: kept in the browser until it is sent (`UnsentUnits`), and put back after a new design version (StudyManager `carryOver`). */
  unit?: UnitPost;
}

/**
 * The finished units still to be sent, kept in the browser (localStorage)
 * per coder session: a coder on a bad connection whose tab is closed or
 * discarded (phones) doesn't lose them. The outbox writes them as they
 * change; StudyManager sends what an earlier visit left when the session
 * starts (posting a unit again stores the same). Storage that fails
 * (private mode, full) just keeps none.
 */
export class UnsentUnits {
  /** The coder session (from the server) the units belong to; none until the session is loaded. */
  sessionId: number | null = null;

  private get key(): string | null {
    return this.sessionId === null ? null : `annotinder:unsent-units:${this.sessionId}`;
  }

  write(posts: UnitPost[]): void {
    const key = this.key;
    if (!key) return;
    try {
      if (posts.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(posts));
    } catch {
      // Not kept then
    }
  }

  read(): UnitPost[] {
    const key = this.key;
    if (!key) return [];
    try {
      const posts: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(posts) ? (posts as UnitPost[]) : [];
    } catch {
      return [];
    }
  }
}

/**
 * Saving in the background (docs/client.md §2 "StudyManager"), so the coder
 * never waits for the server. Posts go out one at a time, in order; a newer
 * one for the same answers replaces one still waiting. A failure for lack
 * of a connection (or a server hiccup) is tried again, later and later;
 * another failure stops saving (`error`) until it is cleared. The finished
 * units waiting are kept in the browser too (`UnsentUnits`).
 */
export class Outbox {
  private items: OutboxItem[] = [];
  private draining: Promise<void> | null = null;
  /** The item being sent now: it can't be replaced any more. */
  private sending: OutboxItem | null = null;
  /** How often the outbox was cleared: a send from before a `clear()` is of an item that was dropped. */
  private generation = 0;
  /** Ends the wait before trying again (`dispose`). */
  private stopWaiting: () => void = () => {};
  private disposed = false;
  /** Saving failed (not for lack of a connection): nothing more is sent until `error` is cleared. */
  error: unknown = null;

  constructor(
    /** How long to wait before trying again (the attempt counts from 1). */
    private readonly retryMs: (attempt: number) => number,
    /** Called when the number of unsaved items (`unsavedUnits`: finished units among them) or the retrying state changes. */
    private readonly onChange: (state: { unsaved?: number; unsavedUnits?: number; retrying?: boolean }) => void,
    /** Called when saving in the background failed (see `error`). */
    private readonly onError: () => void,
    private readonly unsent: UnsentUnits,
  ) {}

  /** The items still to be saved, in order. */
  get waiting(): readonly OutboxItem[] {
    return this.items;
  }

  add(item: OutboxItem): void {
    const waiting = this.items.findIndex((other) => other.key === item.key && other !== this.sending);
    if (waiting >= 0) this.items[waiting] = item;
    else this.items.push(item);
    this.changed();
    if (this.error === null) this.drain().catch(() => {}); // (reported by `onError`)
  }

  /** Waits until everything is saved (e.g. before the session ends); throws if saving failed. */
  async flush(): Promise<void> {
    while (this.items.length > 0) await this.drain();
  }

  /** The item whose saving failed (`error`), if any. */
  get failed(): OutboxItem | null {
    return this.error === null ? null : (this.items[0] ?? null);
  }

  /** Gives up on the item whose saving failed: the items after it are saved. */
  dropFailed(): void {
    if (this.error === null) return;
    this.items.shift();
    this.error = null;
    this.changed();
    if (this.items.length > 0) this.drain().catch(() => {});
  }

  /** Drops everything still waiting (and a failure), e.g. after a new design version. */
  clear(): void {
    this.items = [];
    this.error = null;
    this.generation += 1;
    this.changed({ retrying: false });
  }

  /** Stops sending and trying again (the page is left). The units waiting stay in the browser, for the next visit. */
  dispose(): void {
    this.disposed = true;
    this.stopWaiting();
  }

  /** The items changed: kept in the browser (the finished units), and reported. */
  private changed(state: { retrying?: boolean } = {}): void {
    const units = this.items.flatMap((item) => (item.unit ? [item.unit] : []));
    this.unsent.write(units);
    this.onChange({ unsaved: this.items.length, unsavedUnits: units.length, ...state });
  }

  private drain(): Promise<void> {
    if (this.error !== null) return Promise.reject(this.error);
    if (this.disposed) return Promise.reject(new Error("Saving has stopped"));
    this.draining ??= this.sendAll().finally(() => (this.draining = null));
    return this.draining;
  }

  /** Sends the items, the first one first, until none is left or one is refused. */
  private async sendAll(): Promise<void> {
    let attempt = 0;
    while (this.items.length > 0 && !this.disposed) {
      const item = this.items[0];
      const generation = this.generation;
      try {
        await this.send(item);
      } catch (err) {
        // The item was dropped meanwhile (`clear`): its failure doesn't matter
        if (generation !== this.generation) continue;
        if (!isTransient(err)) {
          this.error = err;
          this.onError();
          throw err;
        }
        attempt += 1;
        this.onChange({ retrying: true });
        await this.wait(this.retryMs(attempt));
        continue;
      }
      // (After a `clear` the item is gone already, and others may have come)
      if (generation === this.generation) this.items = this.items.filter((other) => other !== item);
      attempt = 0;
      this.changed({ retrying: false });
    }
  }

  private async send(item: OutboxItem): Promise<void> {
    this.sending = item;
    try {
      await item.send();
    } finally {
      this.sending = null;
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.stopWaiting = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}
