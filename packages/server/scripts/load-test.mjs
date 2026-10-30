// Load test (docs/hosting.md "Capacity"): one job with UNITS units in a
// shared queue (until 2 coders, at most 2), CODERS simulated coders at once.
// Each starts a session, answers a coder-level question, then fetches
// batches of BATCH units and submits them, with THINK_MS (+-50%) per unit,
// for DURATION seconds. Prints latencies per request and the errors.
//
// Against a server with development auth (never a reachable one), e.g.
//   DATABASE_URL=postgres://... ANNOTINDER_DEV_AUTH=1 PORT=8797 pnpm --filter @annotinder/server exec tsx src/index.ts
//   BASE=http://localhost:8797 CODERS=300 THINK_MS=10000 node packages/server/scripts/load-test.mjs
// JOB and SECRET reuse a job (and its invite) from an earlier run.

const BASE = process.env.BASE ?? "http://localhost:8797";
const UNITS = Number(process.env.UNITS ?? 10000);
const CODERS = Number(process.env.CODERS ?? 300);
const BATCH = Number(process.env.BATCH ?? 5);
const DURATION = Number(process.env.DURATION ?? 120) * 1000;
const THINK_MS = Number(process.env.THINK_MS ?? 1000);
const DEV = { "content-type": "application/json", "x-dev-role": "ADMIN", "x-dev-email": "load@example.com" };

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: DEV, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const value = (v) => ({ done: true, skip: false, values: [{ value: v }] });
const timing = { firstMs: 800, totalMs: 1200, hiddenMs: 0, edits: 1 };

async function setUp() {
  const t0 = Date.now();
  const job = await api("POST", "/job", { name: `Load ${new Date().toISOString()}` });
  for (let i = 0; i < UNITS; i += 200) {
    const units = [];
    for (let j = i; j < Math.min(UNITS, i + 200); j++) {
      units.push({ externalId: `u${j}`, data: { headline: `Headline ${j}`, text: `Some text of unit ${j}. `.repeat(20) } });
    }
    await api("POST", `/job/${job.id}/units`, { units });
  }
  const items = [
    {
      type: "question",
      name: "age",
      variable: { type: "nominal", question: "Your age?", options: [{ value: "young" }, { value: "old" }] },
    },
    {
      type: "unit_loop",
      label: "Headlines",
      units: [{ mode: "shared", unitset: "__all__", until: { coders: 2 }, maxCoders: 2 }],
      layout: { template: "# $unit.headline\n\n$unit.text" },
      children: [
        { type: "question", name: "sentiment", variable: { type: "nominal", question: "Sentiment?", options: [{ value: "pos" }, { value: "neg" }] } },
        { type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "a" }, { value: "b" }, { value: "c" }] } },
      ],
    },
  ];
  const codebook = await api("POST", `/job/${job.id}/codebook`, { items });
  await api("PUT", `/job/${job.id}/deployment`, { codebookId: codebook.id, active: true });
  const invite = await api("POST", `/job/${job.id}/invites`, { label: "load", auth: "none" });
  console.log(`setup: job ${job.id}, ${UNITS} units in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { jobId: job.id, secret: invite.secret };
}

const stats = new Map(); // name -> latencies (ms)
const errors = new Map(); // "name status" -> count
function record(name, ms) {
  if (!stats.has(name)) stats.set(name, []);
  stats.get(name).push(ms);
}

function coderClient(jobId, secret) {
  let cookie = "";
  return async function call(name, method, path, body) {
    const t = performance.now();
    const res = await fetch(`${BASE}/d/${jobId}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-annotinder": "1", "x-invite-secret": secret, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    record(name, performance.now() - t);
    if (!res.ok) {
      const key = `${name} ${res.status} ${text.slice(0, 80)}`;
      errors.set(key, (errors.get(key) ?? 0) + 1);
      return null;
    }
    return text ? JSON.parse(text) : null;
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function coder(jobId, secret, until, n) {
  const call = coderClient(jobId, secret);
  // Coders don't all arrive at once
  await sleep(Math.random() * 10_000);
  const session = await call("session", "GET", "/session");
  if (!session) return 0;
  const loop = session.progress[0].unitset;
  await call("coder vars", "POST", "/variables/coder", { variables: { age: value(n % 2 ? "young" : "old") }, timings: { age: timing } });
  let done = 0;
  while (Date.now() < until) {
    const batch = await call("next", "GET", `/loop/${encodeURIComponent(loop)}/next?count=${BATCH}`);
    if (!batch) break;
    if (batch.units.length === 0) break;
    for (const unit of batch.units) {
      await sleep(THINK_MS * (0.5 + Math.random()));
      await call("submit", "POST", "/variables/unit", {
        unitId: unit.id,
        loop,
        variables: { sentiment: value(Math.random() < 0.5 ? "pos" : "neg"), topic: value("abc"[Math.floor(Math.random() * 3)]) },
        timings: { sentiment: timing, topic: timing },
      });
      done++;
      if (Date.now() >= until) break;
    }
  }
  return done;
}

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

const { jobId, secret } = process.env.JOB ? { jobId: Number(process.env.JOB), secret: process.env.SECRET } : await setUp();
const start = Date.now();
const until = start + DURATION;
const done = await Promise.all(Array.from({ length: CODERS }, (_, i) => coder(jobId, secret, until, i)));
const seconds = (Date.now() - start) / 1000;

console.log(`\n${CODERS} coders, batch ${BATCH}, think ~${THINK_MS}ms, ${seconds.toFixed(0)}s: ${done.reduce((a, b) => a + b, 0)} units submitted`);
console.log("request        n      p50     p95     p99     max  (ms)");
for (const [name, list] of stats) {
  const s = [...list].sort((a, b) => a - b);
  const f = (x) => x.toFixed(0).padStart(7);
  console.log(`${name.padEnd(12)} ${String(s.length).padStart(6)} ${f(pct(s, 50))} ${f(pct(s, 95))} ${f(pct(s, 99))} ${f(s[s.length - 1])}`);
}
for (const [key, n] of errors) console.log(`error x${n}: ${key}`);
console.log(JSON.stringify({ jobId, secret }));
