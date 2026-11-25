import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { addressFrom, type AddressSources } from "../shared/clientAddress.js";
import { emptyDb, query } from "./testDb.js";

const VISITOR = "203.0.113.7";
const CLOUDFLARE = "172.68.10.20";
const PROXY = "10.0.0.2"; // the reverse proxy next to the server

const sources = (given: Partial<AddressSources>): AddressSources => ({
  connection: PROXY,
  forwardedFor: undefined,
  cfConnectingIp: undefined,
  ...given,
});

describe("the client's address", () => {
  it("is the connection's when no proxy is trusted, whatever the headers say", () => {
    const spoofed = sources({ connection: VISITOR, forwardedFor: "198.51.100.1", cfConnectingIp: "198.51.100.2" });
    expect(addressFrom(spoofed, "none")).toBe(VISITOR);
    expect(addressFrom(sources({ connection: undefined }), "none")).toBe("unknown");
  });

  it("behind one proxy is the last entry of X-Forwarded-For: what the proxy wrote, not what the client sent", () => {
    expect(addressFrom(sources({ forwardedFor: VISITOR }), "proxy")).toBe(VISITOR);
    expect(addressFrom(sources({ forwardedFor: `198.51.100.1, ${VISITOR}` }), "proxy")).toBe(VISITOR);
    // CF-Connecting-IP means nothing without Cloudflare in front
    expect(addressFrom(sources({ forwardedFor: VISITOR, cfConnectingIp: "198.51.100.2" }), "proxy")).toBe(VISITOR);
    // A request that didn't come through the proxy
    expect(addressFrom(sources({ connection: VISITOR }), "proxy")).toBe(VISITOR);
  });

  it("behind Cloudflare is CF-Connecting-IP, for requests the proxy got from Cloudflare", () => {
    const viaCloudflare = sources({ forwardedFor: `${VISITOR}, ${CLOUDFLARE}`, cfConnectingIp: VISITOR });
    expect(addressFrom(viaCloudflare, "cloudflare")).toBe(VISITOR);
    expect(addressFrom(viaCloudflare, "proxy")).toBe(CLOUDFLARE);
    const overIpv6 = sources({ forwardedFor: "2606:4700:10::6816:1234", cfConnectingIp: "2001:db8::7" });
    expect(addressFrom(overIpv6, "cloudflare")).toBe("2001:db8::7");
  });

  it("behind Cloudflare ignores CF-Connecting-IP from anyone else: they are counted under their own address", () => {
    const direct = sources({ forwardedFor: VISITOR, cfConnectingIp: "198.51.100.2" });
    expect(addressFrom(direct, "cloudflare")).toBe(VISITOR);
    // Not an address: Cloudflare's own
    const odd = sources({ forwardedFor: CLOUDFLARE, cfConnectingIp: "not an address" });
    expect(addressFrom(odd, "cloudflare")).toBe(CLOUDFLARE);
    expect(addressFrom(sources({ forwardedFor: CLOUDFLARE }), "cloudflare")).toBe(CLOUDFLARE);
  });
});

describe("rate limits behind Cloudflare", () => {
  let db: Db;
  beforeEach(async () => {
    db = await emptyDb();
  });

  it("count each visitor under their own address, not Cloudflare's", async () => {
    const app = createApp(db, { rateLimits: { login: 1 }, trustProxy: "cloudflare" });
    const login = (visitor: string) =>
      app.request("/api/auth/login", { headers: { "x-forwarded-for": CLOUDFLARE, "cf-connecting-ip": visitor } });
    expect((await login(VISITOR)).status).not.toBe(429);
    expect((await login("203.0.113.8")).status).not.toBe(429);
    expect((await login(VISITOR)).status).toBe(429);
    const keys = await query<{ key: string }>(db, "SELECT key FROM rate_limits ORDER BY key");
    expect(keys.map((row) => row.key)).toEqual([`login:${VISITOR}`, "login:203.0.113.8"]);
  });
});
