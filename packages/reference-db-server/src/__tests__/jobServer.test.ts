import { describe, expect, it } from "vitest";
import { fixture } from "@annotinder/conformance";
import type { CoderUnitResponse, SessionResponse } from "@annotinder/contracts";
import { createServer, loadFixture } from "../server.js";
// Only test code reaches into the job server package.
import { createJobServer } from "../../../job-server/src/app.js";
import { MemoryOutboxStore } from "../../../job-server/src/outbox.js";
import { SigningKeys } from "../../../job-server/src/keys.js";
import { JobTokenIssuer } from "../jobTokens.js";

// The reference db server is enough to run a job: a coder works through the
// fixture's loop via the real job server.
describe("job server on the reference db server", () => {
  it("serves units, accepts finished units and resumes after a restart", async () => {
    // The db server fetches the job server's keys from it, to issue job tokens.
    const tokens = new JobTokenIssuer({
      secret: "s",
      publicUrl: "http://ref.test",
      fetch: ((input: string | URL | Request) => server.request(new URL(String(input instanceof Request ? input.url : input)).pathname)) as typeof fetch,
    });
    const db = createServer(loadFixture(fixture, 1, "http://jobs.test"), tokens);
    const toDb = ((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      return db.request(url.pathname + url.search, init);
    }) as typeof fetch;
    const signingKeys = SigningKeys.ephemeral(); // the job server's key, kept across its restart
    // The job server's durable outbox survives its restart (a file on Node).
    const outbox = new MemoryOutboxStore();
    const jobServer = () =>
      createJobServer({ backends: { ref: { url: "http://ref.test" } }, publicUrl: "http://jobs.test", signingKeys, fetch: toDb, outbox });
    let server = jobServer();
    let cookie = ""; // the browser's session cookie
    const call = async (path: string, init?: RequestInit) => {
      const res = await server.request(`/d/ref.1${path}`, {
        ...init,
        headers: { "content-type": "application/json", "x-annotinder": "1", "x-invite-secret": "conf-preset", cookie },
      });
      const [set] = res.headers.getSetCookie();
      if (set) cookie = set.split(";")[0];
      return res;
    };

    const session = (await (await call("/session")).json()) as SessionResponse;
    expect(session.variables.group.codes).toEqual([{ code: "b" }]);

    const first = (await (await call("/loop/main/next")).json()) as CoderUnitResponse;
    expect(first.externalId).toBe("u1");
    const answers = { q1: { done: true, codes: [{ code: "yes" }] }, q2: { done: true, codes: [{ code: "x" }] } };
    const submit = await call("/variables/unit", { method: "POST", body: JSON.stringify({ unitId: first.id, loop: "main", variables: answers }) });
    expect(submit.status).toBe(204);

    server = jobServer(); // restart: everything is rebuilt from the db server
    expect(((await (await call("/session")).json()) as SessionResponse).progress[0].doneUnitIds).toEqual([first.id]);
    expect(((await (await call("/loop/main/next")).json()) as CoderUnitResponse).externalId).toBe("u2");
  });
});
