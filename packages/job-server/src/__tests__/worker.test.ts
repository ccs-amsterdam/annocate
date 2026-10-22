import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDb as openRefDb } from "../../../reference-db-server/src/db.js";
import { seed } from "../../../reference-db-server/src/seed.js";
import { createApp } from "../../../reference-db-server/src/app.js";
import { SigningKeys } from "../keys.js";

// The Cloudflare target, run in workerd (Miniflare) against a real mock db
// server: the Worker routes to a Durable Object per deployment, whose outbox
// lives in its SQLite storage and is flushed by alarms.

const JOB_SERVER_URL = "http://jobs.test";
/** The Worker currently running (tests restart it); the db server fetches its JWKS through it. */
let current: Miniflare | null = null;
let script: string;
let db: DatabaseSync;
let dbServer: ServerType;
let dbUrl: string;
let signingKeys: string;
const persist = mkdtempSync(join(tmpdir(), "do-"));

beforeAll(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../worker.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "neutral",
    conditions: ["workerd", "worker", "browser"],
    mainFields: ["module", "main"],
    write: false,
  });
  script = bundle.outputFiles[0].text;
  signingKeys = JSON.stringify([await SigningKeys.generate()]);

  db = openRefDb(":memory:");
  seed(db);
  // The db server needs its own URL (job tokens are addressed to it), so it is created once the port is known.
  let app: ReturnType<typeof createApp> | null = null;
  await new Promise<void>((resolve) => {
    dbServer = serve({ fetch: (req) => app!.fetch(req), port: 0, hostname: "127.0.0.1" }, (info) => {
      dbUrl = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
  app = createApp(db, {
    jobServer: {
      url: JOB_SERVER_URL,
      fetch: ((input: string | URL | Request, init?: RequestInit) =>
        current!.dispatchFetch(String(input instanceof Request ? input.url : input), init as never)) as unknown as typeof fetch,
    },
    tokens: { secret: "worker-test-token-secret", publicUrl: dbUrl },
  });
}, 60_000);

afterAll(() => {
  dbServer?.close();
  rmSync(persist, { recursive: true, force: true });
});

function worker(flushIntervalMs: number) {
  return (current = new Miniflare({
    modules: true,
    script,
    compatibilityDate: "2026-01-01",
    durableObjects: { DEPLOYMENTS: { className: "DeploymentObject", useSQLite: true } },
    durableObjectsPersist: persist,
    bindings: {
      ANNOTINDER_DB_SERVERS: JSON.stringify([dbUrl]),
      ANNOTINDER_PUBLIC_URL: JOB_SERVER_URL,
      FLUSH_INTERVAL_MS: String(flushIntervalMs),
      ANNOTINDER_SIGNING_KEYS: signingKeys,
    },
  }));
}

/** A browser: keeps the session cookie. */
function browser(mf: () => Miniflare) {
  let cookie = "";
  return async (path: string, init: { method?: string; body?: string } = {}) => {
    const res = await mf().dispatchFetch(`http://jobs.test/d/${new URL(dbUrl).host}/1${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-annotinder": "1", "x-invite-secret": "demo-secret", cookie },
    });
    const set = res.headers.getSetCookie();
    if (set.length > 0) cookie = set[0].split(";")[0];
    return res;
  };
}

const annotatedUnits = () =>
  (db.prepare("SELECT DISTINCT unitId FROM annotation_values ORDER BY unitId").all() as { unitId: number }[]).map((r) => r.unitId);

const demoAnswers = {
  sentiment: { done: true, codes: [{ code: "neutral" }] },
  is_news: { done: true, skip: true },
  topics: { done: true, skip: true },
  actors_and_issues: { done: true, spans: [] },
  framing: { done: true, skip: true },
  usefulness: { done: true, skip: true },
};

describe("Cloudflare target (workerd)", () => {
  it("publishes the configured keys, and Ed25519 works in workerd", async () => {
    const mf = worker(300);
    try {
      const { keys } = (await (await mf.dispatchFetch("http://jobs.test/.well-known/jwks.json")).json()) as { keys: { x: string }[] };
      expect(keys.map((k) => k.x)).toEqual([JSON.parse(signingKeys)[0].x]);
    } finally {
      await mf.dispose();
    }
  }, 60_000);

  it("codes through a Durable Object, flushes by alarm, and keeps the outbox across a restart", async () => {
    let mf = worker(300);
    const call = browser(() => mf);
    try {
      expect((await call("/session")).status).toBe(200);
      await call("/variables/coder", { method: "POST", body: JSON.stringify({ variables: { consent: { done: true, codes: [{ code: "yes" }] } } }) });
      const first = (await (await call("/loop/main_loop/next")).json()) as { id: number };
      expect((await call("/variables/unit", { method: "POST", body: JSON.stringify({ unitId: first.id, variables: demoAnswers }) })).status).toBe(204);
      expect(annotatedUnits()).toEqual([]); // in the outbox
      await new Promise((r) => setTimeout(r, 1500)); // the alarm sends it
      expect(annotatedUnits()).toEqual([first.id]);

      // A long interval, then the object goes away with a write still pending.
      await mf.dispose();
      mf = worker(10 * 60_000);
      const second = (await (await call("/loop/main_loop/next")).json()) as { id: number };
      expect((await call("/variables/unit", { method: "POST", body: JSON.stringify({ unitId: second.id, variables: demoAnswers }) })).status).toBe(204);
      await mf.dispose();
      expect(annotatedUnits()).toEqual([first.id]);

      // After the restart, loading the deployment sends what was left behind.
      mf = worker(10 * 60_000);
      const session = (await (await call("/session")).json()) as { progress: { doneUnitIds: number[] }[] };
      expect(session.progress[0].doneUnitIds).toEqual([first.id, second.id]);
      expect(annotatedUnits()).toEqual([first.id, second.id].sort((a, b) => a - b));
    } finally {
      await mf.dispose();
    }
  }, 60_000);
});
