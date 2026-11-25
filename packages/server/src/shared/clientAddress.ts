import { BlockList, isIP } from "node:net";
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

// The address a request comes from, for the rate limits (shared/rateLimit.ts).
// Headers that name it are believed only from the proxies the server admin
// says are in front (`ANNOTINDER_TRUST_PROXY`, docs/hosting.md): anyone can
// send them.

/**
 * What is in front of the server:
 * - `none`: browsers connect to it directly; the address is the connection's.
 * - `proxy`: one reverse proxy (Caddy, nginx) on the way, the only way in: the
 *   address is the last entry of `X-Forwarded-For`, which that proxy wrote.
 * - `cloudflare`: Cloudflare in front of that proxy: the address is
 *   `CF-Connecting-IP`, but only for requests the proxy got from Cloudflare.
 */
export const TRUST_PROXY = ["none", "proxy", "cloudflare"] as const;
export type TrustProxy = (typeof TRUST_PROXY)[number];

/** For the start-up log: where client addresses come from. */
export const TRUST_PROXY_SOURCE: Record<TrustProxy, string> = {
  none: "the connection (no proxy in front)",
  proxy: "the last entry of X-Forwarded-For (one proxy in front)",
  cloudflare: "CF-Connecting-IP for requests that came through Cloudflare, else the last entry of X-Forwarded-For",
};

/** What a request says about where it comes from. */
export interface AddressSources {
  /** The address that connected to this server; undefined without a socket (tests: `app.request`). */
  connection: string | undefined;
  /** The `X-Forwarded-For` header. */
  forwardedFor: string | undefined;
  /** The `CF-Connecting-IP` header. */
  cfConnectingIp: string | undefined;
}

/** The address a request comes from, as far as `trust` lets its headers say. */
export function addressFrom(sources: AddressSources, trust: TrustProxy): string {
  const connection = sources.connection ?? "unknown";
  if (trust === "none") return connection;
  // Who connected to the proxy: the proxy adds it at the end, whatever the client sent before it
  const proxyPeer = sources.forwardedFor?.split(",").at(-1)?.trim();
  if (!proxyPeer) return connection;
  const visitor = sources.cfConnectingIp?.trim();
  if (trust === "cloudflare" && visitor && isIP(visitor) && isCloudflare(proxyPeer)) return visitor;
  return proxyPeer;
}

/** The address the request `c` comes from. */
export function clientAddress(c: Context, trust: TrustProxy): string {
  return addressFrom(
    {
      connection: connectionAddress(c),
      forwardedFor: c.req.header("x-forwarded-for"),
      cfConnectingIp: c.req.header("cf-connecting-ip"),
    },
    trust,
  );
}

function connectionAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // no socket
  }
}

/**
 * The addresses Cloudflare's proxies connect from (https://www.cloudflare.com/ips/,
 * as of November 2026; the list changes about once in a few years). A request
 * from a range that is missing here is counted under Cloudflare's address
 * instead of the visitor's: limits get tighter, never looser.
 */
const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const cloudflare = new BlockList();
for (const range of CLOUDFLARE_RANGES) {
  const [network, prefix] = range.split("/");
  cloudflare.addSubnet(network!, Number(prefix), network!.includes(":") ? "ipv6" : "ipv4");
}

function isCloudflare(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && cloudflare.check(address, family === 6 ? "ipv6" : "ipv4");
}
