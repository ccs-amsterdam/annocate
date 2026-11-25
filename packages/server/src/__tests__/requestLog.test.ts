import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { emptyDb } from "./testDb.js";

let db: Db;
let lines: string[];
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await emptyDb();
  lines = [];
  app = createApp(db, { devMode: true, log: (line) => lines.push(line) });
});
afterEach(() => vi.restoreAllMocks());

const adminHeaders = { "content-type": "application/json", "x-dev-role": "ADMIN" };

describe("the request log", () => {
  it("has one line per API request: method, path, status, duration and the request's id", async () => {
    const res = await app.request("/api/study", { headers: adminHeaders });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^GET \/api\/study 200 \d+ms [0-9a-f]{12}$/);
    expect(lines[0]!.endsWith(` ${res.headers.get("x-request-id")}`)).toBe(true);
  });

  it("never has the query string, a body, a header or a download token", async () => {
    await app.request("/api/d/demostudy001/session?link=linksecret&PROLIFIC_PID=panelid", {
      headers: { "x-annotinder": "1", "x-link-secret": "headersecret", cookie: "annotinder_device=devicesecret" },
    });
    await app.request("/api/study", {
      method: "POST",
      headers: { ...adminHeaders, authorization: "Bearer keysecret" },
      body: JSON.stringify({ name: "bodysecret" }),
    });
    await app.request("/api/files/tokensecret");
    expect(lines.map((line) => line.split(" ").slice(0, 2).join(" "))).toEqual([
      "GET /api/d/demostudy001/session",
      "POST /api/study",
      "GET /api/files/…",
    ]);
    expect(lines.join("\n")).not.toMatch(/secret|panelid/);
  });

  it("logs refusals too, and the container's health check only when it fails", async () => {
    await app.request("/api/study"); // not logged in
    await app.request("/api/nothing-here");
    await app.request("/api/health");
    await app.request("/api/ready");
    expect(lines.map((line) => line.split(" ").slice(1, 3).join(" "))).toEqual([
      "/api/study 401",
      "/api/nothing-here 404",
      "/api/ready 200",
    ]);
  });

  it("an unexpected error is logged under the request's id, which the response names", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const breaks = Object.assign(Object.create(db) as Db, {
      select: () => {
        throw new Error("the database broke");
      },
    });
    const broken = createApp(breaks, { devMode: true, log: (line) => lines.push(line) });
    const res = await broken.request("/api/study", { headers: adminHeaders });
    expect(res.status).toBe(500);
    const requestId = res.headers.get("x-request-id");
    expect(await res.json()).toEqual({ error: "Internal error", requestId });
    expect(lines.at(-1)).toMatch(new RegExp(` 500 \\d+ms ${requestId}$`));
    expect(errors).toHaveBeenCalledTimes(1);
    const logged = errors.mock.calls[0]![0] as string;
    expect(logged.startsWith(`Error in request ${requestId}\n`)).toBe(true);
    expect(logged).toContain("the database broke");
  });
});
