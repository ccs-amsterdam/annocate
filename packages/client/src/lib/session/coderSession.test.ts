import { afterEach, describe, expect, it, vi } from "vitest";
import { redeemTransfer } from "./coderSession";

describe("redeemTransfer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("redeems a token once, with the scope's headers, and lets the server set the cookie", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const scope = { baseUrl: "/d/1", participantId: "P1" };
    await Promise.all([redeemTransfer(scope, "tok"), redeemTransfer(scope, "tok")]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/d/1/transfer/redeem");
    expect(init.headers).toMatchObject({ "x-annotinder": "1", "x-participant-id": "P1" });
    expect(init.credentials).toBe("same-origin");
  });
});

describe("HttpJobServer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the page's other query parameters for url_param variables", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { HttpJobServer } = await import("../api/httpJobServer");
    await new HttpJobServer({ baseUrl: "/d/amcat.nl/42", urlParams: { src: "panel A", wave: "2" } }).getSession();
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URLSearchParams((init.headers as Record<string, string>)["x-url-params"])).toEqual(new URLSearchParams("src=panel+A&wave=2"));
    await new HttpJobServer({ baseUrl: "/d/amcat.nl/42" }).getSession();
    expect((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("x-url-params");
  });
});
