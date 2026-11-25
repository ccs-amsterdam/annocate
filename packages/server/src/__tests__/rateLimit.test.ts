import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoderErrorCodeSchema } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { TooManyRequests } from "../shared/http.js";
import { DEFAULT_RATE_LIMITS, RateLimiter } from "../shared/rateLimit.js";
import { emptyDb, query } from "./testDb.js";

let db: Db;

beforeEach(async () => {
  db = await emptyDb();
});
afterEach(() => vi.useRealTimers());

const counts = () => query<{ key: string; count: number }>(db, "SELECT key, count FROM rate_limits ORDER BY key");

describe("the rate limiter", () => {
  const limiter = (limits: Partial<typeof DEFAULT_RATE_LIMITS>) =>
    new RateLimiter(db, { ...DEFAULT_RATE_LIMITS, ...limits }, "none");

  it("counts per kind and per who asks, in the database; past the limit it refuses with the seconds to wait", async () => {
    const limits = limiter({ researcher: 2 });
    await limits.count("researcher", 7);
    await limits.count("researcher", 7);
    await limits.count("researcher", 8); // another user
    const refused = await limits.count("researcher", 7).catch((err: unknown) => err);
    expect(refused).toBeInstanceOf(TooManyRequests);
    expect(refused).toMatchObject({ status: 429, code: "rate_limited" });
    // A code the coding client knows
    expect(CoderErrorCodeSchema.safeParse((refused as TooManyRequests).code).success).toBe(true);
    expect((refused as TooManyRequests).retryAfter).toBeGreaterThan(0);
    expect((refused as TooManyRequests).retryAfter).toBeLessThanOrEqual(60);
    expect(await counts()).toEqual([
      { key: "researcher:7", count: 3 },
      { key: "researcher:8", count: 1 },
    ]);
  });

  it("counts new sessions per 10 minutes, the other kinds per minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T10:00:30Z"));
    const limits = limiter({ newSessions: 1, login: 1 });
    await limits.count("newSessions", "192.0.2.1");
    await limits.count("login", "192.0.2.1");
    const refused = await limits.count("newSessions", "192.0.2.1").catch((err: unknown) => err);
    expect((refused as TooManyRequests).retryAfter).toBe(570);
    expect((refused as TooManyRequests).message).toBe("Too many requests: try again in 10 minutes");

    vi.setSystemTime(new Date("2026-11-25T10:01:00Z"));
    await limits.count("login", "192.0.2.1"); // a new minute
    await expect(limits.count("newSessions", "192.0.2.1")).rejects.toBeInstanceOf(TooManyRequests);

    vi.setSystemTime(new Date("2026-11-25T10:10:00Z"));
    await limits.count("newSessions", "192.0.2.1");
  });

  it("doesn't count a kind without a limit", async () => {
    const limits = limiter({ newSessions: Infinity });
    for (let i = 0; i < 3; i++) await limits.count("newSessions", "192.0.2.1");
    expect(await counts()).toEqual([]);
  });
});

describe("rate limits on requests", () => {
  const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

  it("answer 429 rate_limited with Retry-After", async () => {
    const app = createApp(db, { devMode: true, rateLimits: { researcherAddress: 2 } });
    for (let i = 0; i < 2; i++) expect((await app.request("/api/study", { headers: adminHeaders })).status).toBe(200);
    const refused = await app.request("/api/study", { headers: adminHeaders });
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(refused.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    expect(await refused.json()).toEqual({ error: "Too many requests: try again in a minute", code: "rate_limited" });
  });

  it("the researcher API is limited per address whatever credentials a request makes up: one count per address", async () => {
    const app = createApp(db, { rateLimits: { researcherAddress: 50 } });
    const statuses: number[] = [];
    for (let i = 0; i < 60; i++) {
      const res = await app.request("/api/study", { headers: { authorization: `Bearer made-up-${i}` } });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 50).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(50).every((status) => status === 429)).toBe(true);
    expect(await counts()).toEqual([{ key: "researcherAddress:unknown", count: 60 }]);
  });

  it("logging in and redeeming transfer tokens are limited per address", async () => {
    const app = createApp(db, { rateLimits: { login: 1, transfer: 1 } });
    const redeem = () =>
      app.request("/api/d/demostudy001/transfer/redeem", { method: "POST", headers: { "x-annotinder": "1" } });
    expect((await redeem()).status).not.toBe(429);
    expect((await redeem()).status).toBe(429);
    // Other coder requests aren't counted as redeeming
    const session = await app.request("/api/d/demostudy001/session", { headers: { "x-annotinder": "1" } });
    expect(session.status).not.toBe(429);
    expect((await app.request("/api/auth/login")).status).not.toBe(429);
    expect((await app.request("/api/auth/login")).status).toBe(429);
  });

  it("all coder requests are limited per address, in memory", async () => {
    const app = createApp(db, { rateLimits: { coder: 2 } });
    const settings = () => app.request("/api/coder/settings", { headers: { "x-annotinder": "1" } });
    expect((await settings()).status).toBe(401);
    expect((await settings()).status).toBe(401);
    expect((await settings()).status).toBe(429);
    expect(await counts()).toEqual([]);
  });
});
