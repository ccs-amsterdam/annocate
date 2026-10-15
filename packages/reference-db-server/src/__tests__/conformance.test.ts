import { conformanceSuite, fixture } from "@annotinder/conformance";
import { createServer, loadFixture } from "../server.js";

const SECRET = "test-secret";
const app = createServer(loadFixture(fixture, 7), SECRET);

conformanceSuite(() => ({
  baseUrl: "http://reference.test",
  jobId: 7,
  secret: SECRET,
  fetch: ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    return app.request(url.pathname + url.search, init);
  }) as typeof fetch,
}));
