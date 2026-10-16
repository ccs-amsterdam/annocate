import { conformanceSuite, fixture } from "@annotinder/conformance";
import { JobTokenIssuer } from "../jobTokens.js";
import { createServer, loadFixture } from "../server.js";

const DB_URL = "http://reference.test";
const JOB_SERVER_URL = "https://jobs.example";

// The suite plays the job server: its JWKS is served from here.
let jwks: object = { keys: [] };
const tokens = new JobTokenIssuer({
  secret: "token-secret",
  publicUrl: DB_URL,
  fetch: (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${JOB_SERVER_URL}/.well-known/jwks.json`) return Response.json(jwks);
    return new Response("not found", { status: 404 });
  }) as typeof fetch,
});
const app = createServer(loadFixture(fixture, 7, JOB_SERVER_URL), tokens);

conformanceSuite(() => ({
  baseUrl: DB_URL,
  jobId: 7,
  fetch: ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    return app.request(url.pathname + url.search, init);
  }) as typeof fetch,
  tokens: { jobServerUrl: JOB_SERVER_URL, dbServerUrl: DB_URL, serveJwks: (keys) => void (jwks = keys) },
}));
