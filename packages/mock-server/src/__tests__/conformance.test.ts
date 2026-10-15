import { conformanceSuite, fixture } from "@annotinder/conformance";
import { createDb } from "../db/schema.js";
import { seed } from "../db/seed.js";
import { loadFixture } from "../db/fixture.js";
import { createApp } from "../app.js";

// The dev server is a db server too: it must pass the same suite. The demo
// job is seeded first, so the fixture's job doesn't get id 1.
const db = createDb(":memory:");
seed(db);
const jobId = loadFixture(db, fixture);
const app = createApp(db, { backendSecret: "test-secret" });

conformanceSuite(() => ({
  baseUrl: "http://mock.test",
  jobId,
  secret: "test-secret",
  fetch: ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    return app.request(url.pathname + url.search, init);
  }) as typeof fetch,
}));
