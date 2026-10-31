import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Sql } from "../db.js";

// Rate limits (docs/security.md "Rate limits"): generous ceilings against
// floods and guessing, not fraud detection (answer timings are for that).
// Counted per key (a kind of request and an IP address or account) and per
// minute, in an UNLOGGED table so all server processes share the counts.

/** Requests per minute, per kind. */
export interface RateLimits {
  /** Coder requests from a browser without a session here: new sessions, and guessed invite secrets (per IP). */
  coderStart: number;
  /** Redeeming "continue on another device" tokens (per IP). */
  transfer: number;
  /** Researcher login: starting it and coming back (per IP). */
  login: number;
  /** The researcher API (per account, or per IP without one). */
  researcher: number;
  /** All coder requests (per IP): only against floods; counted in memory, per process. */
  coder: number;
}

/**
 * Defaults: a class or a lab behind one address (hundreds of coders at once)
 * stays well below them.
 */
export const DEFAULT_RATE_LIMITS: RateLimits = { coderStart: 300, transfer: 30, login: 60, researcher: 1200, coder: 10_000 };

/** The client's address: the last X-Forwarded-For entry behind a proxy that sets it (`trustProxy`), else the connection's. */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // no socket (tests: app.request)
  }
}

/** Counts in the database, shared by every process. */
export class RateLimiter {
  private lastCleanup = 0;
  /** In-memory counts for `coder` (key -> [minute, count]). */
  private memory = new Map<string, [number, number]>();

  constructor(
    private sql: Sql,
    readonly limits: RateLimits,
    readonly trustProxy: boolean,
  ) {}

  /** Counts a request; true while within `limit` this minute. */
  async hit(key: string, limit: number): Promise<boolean> {
    const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const [row] = await this.sql.query<{ count: number }>(
      `INSERT INTO rate_limits (key, minute) VALUES ($1, $2)
       ON CONFLICT (key, minute) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`,
      [key, minute],
    );
    if (Date.now() - this.lastCleanup > 60_000) {
      this.lastCleanup = Date.now();
      void this.sql.query("DELETE FROM rate_limits WHERE minute < now() - interval '10 minutes'").catch(() => undefined);
    }
    return row.count <= limit;
  }

  /** Counts in this process's memory (cheap, for every request). */
  hitInMemory(key: string, limit: number): boolean {
    const minute = Math.floor(Date.now() / 60_000);
    const entry = this.memory.get(key);
    if (!entry || entry[0] !== minute) {
      if (this.memory.size > 50_000) this.memory.clear();
      this.memory.set(key, [minute, 1]);
      return true;
    }
    return ++entry[1] <= limit;
  }
}

const tooMany = (c: Context) => {
  c.header("Retry-After", "60");
  return c.json({ error: "Too many requests: try again in a minute", code: "rate_limited" }, 429);
};

/** A middleware that limits a kind of request per IP address (or per what `key` returns). */
export function rateLimit(
  limiter: RateLimiter | null,
  kind: keyof RateLimits,
  options: { key?: (c: Context) => string | null; memory?: boolean; when?: (c: Context) => boolean } = {},
): MiddlewareHandler {
  return async (c, next) => {
    if (!limiter || (options.when && !options.when(c))) return next();
    const key = `${kind}:${options.key?.(c) ?? clientIp(c, limiter.trustProxy)}`;
    const limit = limiter.limits[kind];
    const ok = options.memory ? limiter.hitInMemory(key, limit) : await limiter.hit(key, limit);
    if (!ok) return tooMany(c);
    return next();
  };
}
