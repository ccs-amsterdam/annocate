import { afterEach, describe, expect, it, vi } from "vitest";
import { codeLinkUrl, logInWithAccount, redeemTransfer } from "./coderSession";

describe("redeemTransfer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("redeems a token once, with the scope's headers, and lets the server set the cookie", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const scope = { baseUrl: "/d/1", linkSecret: "s1" };
    await Promise.all([redeemTransfer(scope, "tok"), redeemTransfer(scope, "tok")]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/d/1/transfer/redeem");
    expect(init.headers).toMatchObject({ "x-annotinder": "1", "x-link-secret": "s1" });
    expect(init.credentials).toBe("same-origin");
  });
});

describe("logInWithAccount", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("logs in and comes back to the page with the choice to code with the account", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/code/abc", search: "?link=s1&participant=P1", assign } });
    logInWithAccount();
    const [url] = assign.mock.calls[0] as [string];
    expect(url.startsWith("/api/auth/login?returnTo=")).toBe(true);
    expect(new URL(url, "http://x").searchParams.get("returnTo")).toBe("/code/abc?link=s1&participant=P1&login=1");
  });
});

describe("HttpCoderApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the page's other query parameters for url_param variables", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { HttpCoderApi } = await import("../api/httpCoderApi");
    await new HttpCoderApi({ baseUrl: "/d/42", urlParams: { src: "panel A", wave: "2" } }).getSession();
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URLSearchParams((init.headers as Record<string, string>)["x-url-params"])).toEqual(
      new URLSearchParams("src=panel+A&wave=2"),
    );
    await new HttpCoderApi({ baseUrl: "/d/42" }).getSession();
    expect((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("x-url-params");
  });

  it("sends the design version of the loaded session with later requests", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ version: 3 }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { HttpCoderApi } = await import("../api/httpCoderApi");
    const api = new HttpCoderApi({ baseUrl: "/d/42" });
    await api.getSession();
    await api.getNextUnits("loop");
    const headers = (call: number) => (fetch.mock.calls[call] as unknown as [string, RequestInit])[1].headers;
    expect(headers(0)).not.toHaveProperty("x-annotinder-version");
    expect(headers(1)).toMatchObject({ "x-annotinder-version": "3" });
  });
});

describe("a coder link", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names the study by its public id, with the link's secret", () => {
    vi.stubGlobal("window", { location: { origin: "https://annotinder.example.org" } });
    expect(codeLinkUrl("k3v9x2m4q7ta", "s e/cret")).toBe(
      "https://annotinder.example.org/code/k3v9x2m4q7ta?link=s%20e%2Fcret",
    );
  });
});
