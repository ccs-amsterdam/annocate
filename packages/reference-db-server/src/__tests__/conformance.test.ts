import { conformanceSuite, fixture } from "@annotinder/conformance";
import { openDb } from "../db.js";
import { seed } from "../seed.js";
import { loadFixture } from "../fixture.js";
import { createApp } from "../app.js";

// The dev server is a db server too: it must pass the same suite. The demo
// job is seeded first, so the fixture's job doesn't get id 1.
const DB_URL = "http://reference.test";
const JOB_SERVER_URL = "https://jobs.example";

// The suite plays the job server the fixture's job is bound to: its JWKS is served from here.
let jwks: object = { keys: [] };
const toJobServer = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === `${JOB_SERVER_URL}/.well-known/jwks.json`) return Response.json(jwks);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const db = openDb(":memory:");
seed(db);
const jobId = loadFixture(db, fixture, JOB_SERVER_URL);
const app = createApp(db, {
  jobServer: { url: "https://default-job-server.example", fetch: toJobServer },
  tokens: { secret: "token-secret", publicUrl: DB_URL },
});

conformanceSuite(() => ({
  baseUrl: DB_URL,
  jobId,
  fetch: ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    return app.request(url.pathname + url.search, init);
  }) as typeof fetch,
  tokens: { jobServerUrl: JOB_SERVER_URL, dbServerUrl: DB_URL, serveJwks: (keys) => void (jwks = keys) },
}));
