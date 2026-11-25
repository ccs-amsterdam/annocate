import type { Context, MiddlewareHandler } from "hono";
import { lt, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { rateLimits } from "../db/schema/index.js";
import { clientAddress, type TrustProxy } from "./clientAddress.js";
import { TooManyRequests } from "./http.js";

// Rate limits (docs/security.md "Rate limits"): generous ceilings against
// floods and guessing, not fraud detection (answer timings are for that).
// Counted per kind of request and per who asks (an IP address or a user), in
// an UNLOGGED table so all server processes share the counts.

/** Requests per window (`WINDOW_MINUTES`), per kind. `Infinity`: no limit. */
export interface RateLimits {
  /**
   * Devices without a session in a study asking for one (new sessions, and
   * guessed link secrets), per IP per 10 minutes: only a brake, since a whole
   * class can share one address. Counted where a request asks for one (runtime/requestCoder.ts).
   */
  newSessions: number;
  /** Redeeming "continue on another device" tokens (per IP). */
  transfer: number;
  /** Researcher login: starting it and coming back (per IP). */
  login: number;
  /** The researcher API per IP, whoever the request says it is from: counted before authentication. */
  researcherAddress: number;
  /** The researcher API per user: counted once the request is authenticated (researcher/auth.ts). */
  researcher: number;
  /** All coder requests (per IP): only against floods; counted in memory, per process. */
  coder: number;
}

export type RateLimitKind = keyof RateLimits;

/**
 * Defaults: a class or a lab behind one address (hundreds of coders or a
 * department of researchers at once) stays well below them.
 */
export const DEFAULT_RATE_LIMITS: RateLimits = {
  newSessions: 500,
  transfer: 30,
  login: 60,
  researcherAddress: 6000,
  researcher: 1200,
  coder: 10_000,
};

/** How long a kind is counted before its count starts again. */
const WINDOW_MINUTES: Record<RateLimitKind, number> = {
  newSessions: 10,
  transfer: 1,
  login: 1,
  researcherAddress: 1,
  researcher: 1,
  coder: 1,
};

/** Counts older than the longest window are deleted. */
const KEEP_MINUTES = Math.max(...Object.values(WINDOW_MINUTES));

/** The window `now` is in: when it started, and how many seconds until the next one. */
function windowAt(kind: RateLimitKind, now: number): { start: Date; secondsLeft: number } {
  const length = WINDOW_MINUTES[kind] * 60_000;
  const start = Math.floor(now / length) * length;
  return { start: new Date(start), secondsLeft: Math.ceil((start + length - now) / 1000) };
}

/**
 * Counts requests per kind and per who asks: in the database, shared by every
 * process (`count`), or in this process's memory (`countAddressInMemory`).
 * Past the kind's limit they refuse with 429 `rate_limited`.
 */
export class RateLimiter {
  private lastCleanup = 0;
  /** In-memory counts (key -> [window start, count]). */
  private memory = new Map<string, [number, number]>();

  constructor(
    private db: Db,
    readonly limits: RateLimits,
    readonly trustProxy: TrustProxy,
  ) {}

  /** Counts a request of `kind` from `who` (an address, a user id). */
  async count(kind: RateLimitKind, who: string | number): Promise<void> {
    const limit = this.limits[kind];
    if (limit === Infinity) return;
    const { start, secondsLeft } = windowAt(kind, Date.now());
    const [row] = await this.db
      .insert(rateLimits)
      .values({ key: `${kind}:${who}`, minute: start })
      .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.minute], set: { count: sql`${rateLimits.count} + 1` } })
      .returning({ count: rateLimits.count });
    this.cleanUp();
    if (row!.count > limit) throw new TooManyRequests(secondsLeft);
  }

  /** As `count`, for the address the request came from. */
  countAddress(kind: RateLimitKind, c: Context): Promise<void> {
    return this.count(kind, clientAddress(c, this.trustProxy));
  }

  /** As `countAddress`, in this process's memory (cheap, for every request). */
  countAddressInMemory(kind: RateLimitKind, c: Context): void {
    const limit = this.limits[kind];
    if (limit === Infinity) return;
    const key = `${kind}:${clientAddress(c, this.trustProxy)}`;
    const { start, secondsLeft } = windowAt(kind, Date.now());
    const entry = this.memory.get(key);
    if (!entry || entry[0] !== start.getTime()) {
      if (this.memory.size > 50_000) this.memory.clear();
      this.memory.set(key, [start.getTime(), 1]);
      return;
    }
    if (++entry[1] > limit) throw new TooManyRequests(secondsLeft);
  }

  /** Deletes the counts of windows that ended, once a minute. */
  private cleanUp(): void {
    if (Date.now() - this.lastCleanup < 60_000) return;
    this.lastCleanup = Date.now();
    void this.db
      .delete(rateLimits)
      .where(lt(rateLimits.minute, sql`now() - make_interval(mins => ${KEEP_MINUTES})`))
      .catch(() => undefined);
  }
}

/** A middleware that limits a kind of request per IP address; `memory`: counted in this process. */
export function rateLimit(
  limiter: RateLimiter | null,
  kind: RateLimitKind,
  options: { memory?: boolean } = {},
): MiddlewareHandler {
  return async (c, next) => {
    if (limiter) {
      if (options.memory) limiter.countAddressInMemory(kind, c);
      else await limiter.countAddress(kind, c);
    }
    await next();
  };
}
