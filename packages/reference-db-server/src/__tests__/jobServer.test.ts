import { describe, expect, it } from "vitest";
import { fixture } from "@annotinder/conformance";
import type { CoderUnitResponse, SessionResponse } from "@annotinder/contracts";
import { createServer, loadFixture } from "../server.js";
// Only test code reaches into the job server package.
import { createJobServer } from "../../../job-server/src/app.js";

// The reference db server is enough to run a job: a coder works through the
// fixture's loop via the real job server.
describe("job server on the reference db server", () => {
  it("serves units, accepts finished units and resumes after a restart", async () => {
    const db = createServer(loadFixture(fixture), "s");
    const toDb = ((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      return db.request(url.pathname + url.search, init);
    }) as typeof fetch;
    const jobServer = () => createJobServer({ backends: { ref: { url: "http://ref.test", secret: "s" } }, fetch: toDb });
    let server = jobServer();
    const call = (path: string, init?: RequestInit) =>
      server.request(`/d/ref.1${path}`, {
        ...init,
        headers: { "content-type": "application/json", "x-coder-key": "k", "x-invite-secret": "conf-preset" },
      });

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
