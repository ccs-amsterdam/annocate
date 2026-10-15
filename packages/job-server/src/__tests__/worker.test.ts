import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createDb } from "../../../mock-server/src/db/schema.js";
import { seed } from "../../../mock-server/src/db/seed.js";
import { createApp } from "../../../mock-server/src/app.js";

// The Cloudflare target, run in workerd (Miniflare) against a real mock db
// server: the Worker routes to a Durable Object per deployment, whose outbox
// lives in its SQLite storage and is flushed by alarms.

const SECRET = "worker-test-secret";
let script: string;
let db: DatabaseSync;
let dbServer: ServerType;
let dbUrl: string;
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

  db = createDb(":memory:");
  seed(db);
  const app = createApp(db, { backendSecret: SECRET });
  await new Promise<void>((resolve) => {
    dbServer = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      dbUrl = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
}, 60_000);

afterAll(() => {
  dbServer?.close();
  rmSync(persist, { recursive: true, force: true });
});

function worker(flushIntervalMs: number) {
  return new Miniflare({
    modules: true,
    script,
    compatibilityDate: "2026-01-01",
    durableObjects: { DEPLOYMENTS: { className: "DeploymentObject", useSQLite: true } },
    durableObjectsPersist: persist,
    bindings: {
      ANNOTINDER_BACKENDS: JSON.stringify({ mock: { url: dbUrl, secret: SECRET } }),
      FLUSH_INTERVAL_MS: String(flushIntervalMs),
    },
  });
}

/** A browser: keeps the session cookie. */
function browser(mf: () => Miniflare) {
  let cookie = "";
  return async (path: string, init: { method?: string; body?: string } = {}) => {
    const res = await mf().dispatchFetch(`http://jobs.test/d/mock.1${path}`, {
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
  actors_and_issues: { done: true, spans: [] },
  actor_relations: { done: true, relations: [] },
};

describe("Cloudflare target (workerd)", () => {
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
