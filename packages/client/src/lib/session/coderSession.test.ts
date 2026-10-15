import { afterEach, describe, expect, it, vi } from "vitest";
import { redeemTransfer } from "./coderSession";

describe("redeemTransfer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("redeems a token once, with the scope's headers, and lets the server set the cookie", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const scope = { baseUrl: "/d/mock.1", participantId: "P1" };
    await Promise.all([redeemTransfer(scope, "tok"), redeemTransfer(scope, "tok")]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/d/mock.1/transfer/redeem");
    expect(init.headers).toMatchObject({ "x-annotinder": "1", "x-participant-id": "P1" });
    expect(init.credentials).toBe("same-origin");
  });
});
