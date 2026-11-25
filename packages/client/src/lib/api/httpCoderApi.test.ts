import { afterEach, describe, expect, it, vi } from "vitest";
import { CoderApiError, HttpCoderApi, type HttpCoderApiConfig } from "./httpCoderApi";

afterEach(() => vi.unstubAllGlobals());

interface Request {
  url: string;
  method: string;
  headers: Record<string, string>;
  credentials?: string;
}

/** A server answering every request with `respond` (default: a session of version 3); the requests it got. */
function server(respond: () => Response = () => Response.json({ version: 3 })): Request[] {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    requests.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      credentials: init.credentials,
    });
    return respond();
  });
  return requests;
}

const api = (config: Partial<HttpCoderApiConfig> = {}) => new HttpCoderApi({ baseUrl: "/d/abc", ...config });

/** The error a request fails with. */
async function failure(run: Promise<unknown>): Promise<CoderApiError> {
  const err = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(CoderApiError);
  return err as CoderApiError;
}

describe("the headers of a coder API request", () => {
  it("always: the marker cross-site forms can't send, as JSON, with the device's cookie", async () => {
    const requests = server();
    await api().getSession();
    expect(requests[0].url).toBe("/d/abc/session");
    expect(requests[0].headers).toEqual({ "content-type": "application/json", "x-annotinder": "1" });
    expect(requests[0].credentials).toBe("same-origin");
  });

  it("the link's secret, the choice to code with the account, and the name picked (encoded)", async () => {
    const requests = server();
    await api({ linkSecret: "s3cret", useLogin: true, coderName: "Zoë Müller" }).getSession();
    expect(requests[0].headers).toMatchObject({
      "x-link-secret": "s3cret",
      "x-use-login": "1",
      "x-coder-name": "Zo%C3%AB%20M%C3%BCller",
    });
  });

  it("the page's URL parameters as one query string, cut off at 2000 characters", async () => {
    const requests = server();
    await api({ urlParams: { pid: "p 7", source: "panel&co" } }).getSession();
    expect(requests[0].headers["x-url-params"]).toBe("pid=p+7&source=panel%26co");
    await api({ urlParams: { pid: "x".repeat(5000) } }).getSession();
    expect(requests[1].headers["x-url-params"]).toHaveLength(2000);
  });

  it("the loaded session's version, from the request after it was loaded", async () => {
    const requests = server();
    const coder = api();
    await coder.getSession();
    await coder.getNextUnits("loop_1", 5).catch(() => {});
    expect(requests[0].headers).not.toHaveProperty("x-annotinder-version");
    expect(requests[1].headers["x-annotinder-version"]).toBe("3");
    expect(requests[1].url).toBe("/d/abc/loop/loop_1/next?count=5");
  });

  it("a new session is asked for until a request succeeded, so only one is made", async () => {
    let ok = false;
    const requests = server(() => (ok ? Response.json({ version: 1 }) : new Response("down", { status: 503 })));
    const coder = api({ newSession: true });
    await coder.getSession().catch(() => {});
    ok = true;
    await coder.getSession();
    await coder.getSession();
    expect(requests.map((r) => r.headers["x-new-session"])).toEqual(["1", "1", undefined]);
  });

  it("a loop's key and a unit's id are part of the path, encoded", async () => {
    const requests = server();
    await api().getLoopUnit("my loop/1", 42);
    expect(requests[0].url).toBe("/d/abc/loop/my%20loop%2F1/units/42");
  });
});

describe("a failed coder API request", () => {
  it("is the server's message, with its status and its code", async () => {
    server(() => Response.json({ error: "The design changed", code: "design_changed" }, { status: 409 }));
    const err = await failure(api().getSession());
    expect(err.message).toBe("The design changed");
    expect(err.status).toBe(409);
    expect(err.code).toBe("design_changed");
  });

  it("has no code when the server gives none, or one that is no text", async () => {
    server(() => Response.json({ error: "Not found", code: 7 }, { status: 404 }));
    const err = await failure(api().getSession());
    expect(err.message).toBe("Not found");
    expect(err.code).toBeUndefined();
  });

  it("is the whole body when it is JSON without an error text", async () => {
    server(() => new Response('{"detail":"x"}', { status: 400 }));
    expect((await failure(api().getSession())).message).toBe('{"detail":"x"}');
  });

  it("names the path and status when the answer is no JSON (a proxy's error page)", async () => {
    server(() => new Response("<h1>Bad gateway</h1>", { status: 502 }));
    const err = await failure(api().getSession());
    expect(err.message).toBe("Request to /session failed (502): <h1>Bad gateway</h1>");
    expect(err.status).toBe(502);
  });

  it("an answer without content (204) is no value, and no failure", async () => {
    server(() => new Response(null, { status: 204 }));
    expect(await api().reopenSession()).toBeUndefined();
  });
});

describe("requests that start no session", () => {
  it("a pick-your-name link's names: the marker and the link's secret only", async () => {
    const requests = server(() => Response.json({ names: [] }));
    await HttpCoderApi.getNames({ baseUrl: "/d/abc", linkSecret: "s3cret" });
    expect(requests[0].headers).toEqual({ "x-annotinder": "1", "x-link-secret": "s3cret" });
  });

  it("redeeming a transfer token fails with the server's code", async () => {
    server(() => Response.json({ error: "Used", code: "transfer_invalid" }, { status: 400 }));
    const err = await failure(HttpCoderApi.redeemTransfer({ baseUrl: "/d/abc" }, "token"));
    expect(err.code).toBe("transfer_invalid");
  });
});
