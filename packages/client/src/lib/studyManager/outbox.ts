import type { VariableValue } from "@annotinder/contracts";
import { isTransient } from "./errors";

/** Answers waiting to be saved. */
export interface OutboxItem {
  /** What it saves: a newer item with the same key replaces one still waiting. */
  key: string;
  send: () => Promise<unknown>;
  /** A unit's answers, to put back after a new design version (StudyManager `carryOver`). */
  unit?: { loop: string; unitId: number; answers: Record<string, VariableValue> };
}

/**
 * Saving in the background (docs/client.md §2 "StudyManager"), so the coder
 * never waits for the server. Posts go out one at a time, in order; a newer
 * one for the same answers replaces one still waiting. A failure for lack
 * of a connection (or a server hiccup) is tried again, later and later;
 * another failure stops saving (`error`) until it is cleared.
 */
export class Outbox {
  private items: OutboxItem[] = [];
  private draining: Promise<void> | null = null;
  /** Saving failed (not for lack of a connection): nothing more is sent until `error` is cleared. */
  error: unknown = null;

  constructor(
    /** How long to wait before trying again (the attempt counts from 1). */
    private readonly retryMs: (attempt: number) => number,
    /** Called when the number of unsaved items or the retrying state changes. */
    private readonly onChange: (state: { unsaved?: number; retrying?: boolean }) => void,
    /** Called when saving in the background failed (see `error`). */
    private readonly onError: () => void,
  ) {}

  /** The items still to be saved, in order. */
  get waiting(): readonly OutboxItem[] {
    return this.items;
  }

  add(item: OutboxItem): void {
    // The item being sent can't be replaced any more
    const waiting = this.items.findIndex((other, i) => other.key === item.key && !(i === 0 && this.draining));
    if (waiting >= 0) this.items[waiting] = item;
    else this.items.push(item);
    this.onChange({ unsaved: this.items.length });
    if (this.error === null) this.drain().catch(() => this.onError());
  }

  /** Waits until everything is saved (e.g. before the session ends); throws if saving failed. */
  async flush(): Promise<void> {
    while (this.items.length > 0) await this.drain();
  }

  /** Drops everything still waiting (and a failure), e.g. after a new design version. */
  clear(): void {
    this.items = [];
    this.error = null;
  }

  private drain(): Promise<void> {
    if (this.error !== null) return Promise.reject(this.error);
    this.draining ??= (async () => {
      let attempt = 0;
      try {
        while (this.items.length > 0) {
          try {
            await this.items[0].send();
            this.items.shift();
            attempt = 0;
            this.onChange({ unsaved: this.items.length, retrying: false });
          } catch (err) {
            if (!isTransient(err)) {
              this.error = err;
              throw err;
            }
            attempt += 1;
            this.onChange({ retrying: true });
            await new Promise((resolve) => setTimeout(resolve, this.retryMs(attempt)));
          }
        }
      } finally {
        this.draining = null;
      }
    })();
    return this.draining;
  }
}
