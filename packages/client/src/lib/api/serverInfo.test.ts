import { afterEach, describe, expect, it, vi } from "vitest";
import { loadServerInfo } from "./serverInfo";

afterEach(() => vi.unstubAllGlobals());

const INFO = {
  operator: "The Example Lab",
  hosting: null,
  contact: null,
  privacyUrl: null,
  termsUrl: null,
  version: { release: "0.9.0", commit: "abc1234" },
};

describe("loadServerInfo", () => {
  it("asks the server's public info endpoint", async () => {
    const fetched = vi.fn(async () => new Response(JSON.stringify(INFO)));
    vi.stubGlobal("fetch", fetched);
    expect(await loadServerInfo("/api")).toEqual(INFO);
    expect(fetched).toHaveBeenCalledWith("/api/info");
  });

  it("fails on an error response", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    await expect(loadServerInfo("/api")).rejects.toThrow("failed (500)");
  });
});
