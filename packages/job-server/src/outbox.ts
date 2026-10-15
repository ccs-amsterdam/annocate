import type { BackendAnnotationWrite, BackendCoderWrite } from "@annotinder/contracts";
import { HttpError, type Backend } from "./backend.js";

// Writes to the db server don't hold up the coder (docs/plan-trust-sessions-
// codings.md §10): they are stored durably here first, the coder gets "ok",
// and they are sent in batches about once a minute, with backoff while the
// db server is unreachable. Before the job server reads from the db server,
// it flushes, so it never reads state older than its own writes.

export type OutboxWrite =
  | { kind: "annotation"; write: BackendAnnotationWrite }
  /** Full replace of a coder record: only the latest per coder is sent. */
  | { kind: "coder"; coderId: number; write: BackendCoderWrite };

export interface OutboxEntry {
  id: number;
  createdAt: number;
  write: OutboxWrite;
}

/**
 * Durable storage for pending writes, shared by all deployments of a job
 * server: a SQLite file on Node (outboxSqlite.ts), Durable Object storage on
 * Cloudflare, memory in tests. Synchronous, so a write is stored before the
 * coder is told it was saved.
 */
export interface OutboxStore {
  append(deploymentId: string, write: OutboxWrite, createdAt: number): void;
  /** Oldest first. */
  pending(deploymentId: string, limit: number): OutboxEntry[];
  remove(ids: number[]): void;
  stats(deploymentId: string): { pending: number; oldestAt: number | null };
  /** Deployments with pending writes, e.g. to resume them after a restart. */
  deployments(): string[];
}

export class MemoryOutboxStore implements OutboxStore {
  private entries: (OutboxEntry & { deploymentId: string })[] = [];
  private nextId = 1;

  append(deploymentId: string, write: OutboxWrite, createdAt: number): void {
    // Stored as JSON, like the durable stores: no shared references.
    this.entries.push({ id: this.nextId++, deploymentId, createdAt, write: JSON.parse(JSON.stringify(write)) });
  }
  pending(deploymentId: string, limit: number): OutboxEntry[] {
    return this.entries.filter((e) => e.deploymentId === deploymentId).slice(0, limit);
  }
  remove(ids: number[]): void {
    const gone = new Set(ids);
    this.entries = this.entries.filter((e) => !gone.has(e.id));
  }
  stats(deploymentId: string) {
    const mine = this.entries.filter((e) => e.deploymentId === deploymentId);
    return { pending: mine.length, oldestAt: mine[0]?.createdAt ?? null };
  }
  deployments(): string[] {
    return [...new Set(this.entries.map((e) => e.deploymentId))];
  }
}

export interface OutboxOptions {
  /**
   * How long a write may wait before it is sent. `0`: send right away and
   * wait for it (write-through; a failed send still keeps the write).
   */
  flushIntervalMs: number;
  /** Writes per batch; this many pending also triggers a flush. */
  flushBatch: number;
  /** Past these limits (db server unreachable too long), new writes are refused rather than buffered. */
  maxPending: number;
  maxAgeMs: number;
  /** Delays between failed flushes; the last one repeats. */
  retryDelaysMs: number[];
  now: () => number;
  /** Runs `fn` after `ms`; returns a cancel function. Cloudflare would use Durable Object alarms. */
  schedule: (fn: () => void, ms: number) => () => void;
}

export const DEFAULT_OUTBOX_OPTIONS: Omit<OutboxOptions, "now"> = {
  flushIntervalMs: 60_000,
  flushBatch: 200,
  maxPending: 10_000,
  maxAgeMs: 24 * 60 * 60_000,
  retryDelaysMs: [60_000, 2 * 60_000, 5 * 60_000, 15 * 60_000],
  schedule: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    // Don't keep a Node process alive just for this.
    (timer as { unref?: () => void }).unref?.();
    return () => clearTimeout(timer);
  },
};

export interface OutboxStatus {
  pending: number;
  oldestAt: Date | null;
  /** Consecutive failed flushes; 0 when the db server takes writes. */
  failures: number;
  lastError?: string;
}

/** One deployment's pending writes. */
export class Outbox {
  private flushing: Promise<void> | null = null;
  private timer: { at: number; cancel: () => void } | null = null;
  private failures = 0;
  private lastError?: string;

  constructor(
    private deploymentId: string,
    private store: OutboxStore,
    private backend: Backend,
    private options: OutboxOptions,
    private log: (message: string) => void = (m) => console.warn(m),
  ) {}

  /**
   * Stores a write. Resolves once it is durable (and, in write-through mode,
   * once a send was attempted). Refuses with 503 when the outbox is past its
   * limits, so coders aren't told "saved" indefinitely while nothing arrives.
   */
  async add(write: OutboxWrite): Promise<void> {
    const now = this.options.now();
    const { pending, oldestAt } = this.store.stats(this.deploymentId);
    if (pending >= this.options.maxPending || (oldestAt !== null && now - oldestAt >= this.options.maxAgeMs)) {
      throw new HttpError(503, "Your answers can't be saved right now. Please try again later.", "storage_unavailable");
    }
    this.store.append(this.deploymentId, write, now);
    if (this.options.flushIntervalMs <= 0) {
      await this.flush().catch(() => {}); // kept, and retried with backoff
    } else if (pending + 1 >= this.options.flushBatch) {
      this.scheduleFlush(0);
    } else if (this.failures === 0) {
      this.scheduleFlush(this.options.flushIntervalMs);
    }
  }

  /** Sends everything pending. Single-flight; rejects if the db server fails (the writes stay). */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  status(): OutboxStatus {
    const { pending, oldestAt } = this.store.stats(this.deploymentId);
    return {
      pending,
      oldestAt: oldestAt === null ? null : new Date(oldestAt),
      failures: this.failures,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  /** Starts sending what a previous run left behind. */
  resume(): void {
    if (this.store.stats(this.deploymentId).pending > 0) this.scheduleFlush(0);
  }

  private scheduleFlush(ms: number): void {
    const at = this.options.now() + ms;
    if (this.timer && this.timer.at <= at) return;
    this.timer?.cancel();
    const cancel = this.options.schedule(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, ms);
    this.timer = { at, cancel };
  }

  private async drain(): Promise<void> {
    for (;;) {
      const entries = this.store.pending(this.deploymentId, this.options.flushBatch);
      if (entries.length === 0) return;
      try {
        await this.send(entries);
      } catch (err) {
        this.failures++;
        this.lastError = err instanceof Error ? err.message : String(err);
        const delays = this.options.retryDelaysMs;
        this.scheduleFlush(delays[Math.min(this.failures, delays.length) - 1]);
        throw err;
      }
      this.failures = 0;
      this.lastError = undefined;
    }
  }

  private async send(entries: OutboxEntry[]): Promise<void> {
    const annotations = entries.filter((e) => e.write.kind === "annotation");
    if (annotations.length > 0) {
      const writes = annotations.map((e) => (e.write as Extract<OutboxWrite, { kind: "annotation" }>).write);
      const { rejected } = await this.backend.putAnnotations(writes);
      for (const r of rejected) {
        const w = writes[r.index];
        this.log(`[${this.deploymentId}] db server rejected unit ${w?.unitId} of coder ${w?.coderId}: ${r.error}`);
      }
      this.store.remove(annotations.map((e) => e.id));
    }

    // Coder records are full replaces: send the latest per coder.
    const byCoder = new Map<number, OutboxEntry[]>();
    for (const e of entries) {
      if (e.write.kind === "coder") byCoder.set(e.write.coderId, [...(byCoder.get(e.write.coderId) ?? []), e]);
    }
    for (const [coderId, list] of byCoder) {
      const latest = list[list.length - 1].write as Extract<OutboxWrite, { kind: "coder" }>;
      try {
        await this.backend.putCoder(coderId, latest.write);
      } catch (err) {
        // Only a coder the db server doesn't know can never succeed.
        if (!(err instanceof HttpError && err.status === 404)) throw err;
        this.log(`[${this.deploymentId}] db server doesn't know coder ${coderId}; dropping its update`);
      }
      this.store.remove(list.map((e) => e.id));
    }
  }
}
