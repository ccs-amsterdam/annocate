import { describe, expect, it } from "vitest";
import { DbServers, DEFAULT_DB_SERVER_OPTIONS, isPublicHostname, parseDeploymentId } from "../dbServers.js";
import { HttpError } from "../backend.js";

describe("deployment ids", () => {
  it("are <db host>/<jobId>, or a preview", () => {
    expect(parseDeploymentId("amcat.nl/42")).toEqual({ host: "amcat.nl", jobId: 42, preview: false });
    expect(parseDeploymentId("localhost:8787/1.preview")).toEqual({ host: "localhost:8787", jobId: 1, preview: true });
    expect(parseDeploymentId("Amcat.NL/7")?.host).toBe("amcat.nl");
    for (const bad of ["amcat.nl", "amcat.nl/x", "amcat.nl/1/2", "/1", "mock.1"]) expect(parseDeploymentId(bad)).toBeNull();
  });
});

describe("open job servers", () => {
  it("only reach public DNS names, on the default https port", () => {
    for (const ok of ["amcat.nl", "db.annotinder.com", "a-b.example-db.org"]) expect(isPublicHostname(ok)).toBe(true);
    for (const bad of ["localhost", "db.local", "metadata.internal", "10.0.0.1", "127.0.0.1", "db.nl:8080", "intranet", "[::1]", "x.test"]) {
      expect(isPublicHostname(bad)).toBe(false);
    }
  });

  const ok = (status = 200, headers: Record<string, string> = {}) => new Response("{}", { status, headers });
  const make = (fetchImpl: typeof fetch, options: Partial<typeof DEFAULT_DB_SERVER_OPTIONS> = {}) =>
    new DbServers("open", fetchImpl, { ...DEFAULT_DB_SERVER_OPTIONS, ...options });
  const status = (p: Promise<unknown>) => p.then(() => 200, (e: unknown) => (e instanceof HttpError ? e.status : 500));

  it("map a host to https, and refuse hosts that aren't public", async () => {
    const servers = make((async () => ok()) as typeof fetch);
    expect(servers.urlFor("amcat.nl")).toBe("https://amcat.nl");
    expect(() => servers.urlFor("localhost:8787")).toThrow(HttpError);
    const checked = make((async () => ok()) as typeof fetch, { checkHost: async (host) => host !== "private.example-db.org" });
    expect(await status(checked.fetch("https://amcat.nl/x"))).toBe(200);
    expect(await status(checked.fetch("https://private.example-db.org/x"))).toBe(404);
  });

  it("don't follow redirects, and refuse huge responses", async () => {
    const redirecting = make((async () => ok(302, { location: "http://169.254.169.254/" })) as typeof fetch);
    expect(await status(redirecting.fetch("https://amcat.nl/x"))).toBe(502);
    const huge = make((async () => ok(200, { "content-length": String(64 * 2 ** 20) })) as typeof fetch);
    expect(await status(huge.fetch("https://amcat.nl/x"))).toBe(502);
  });

  it("cap requests per db host, and recover over time", async () => {
    let now = 0;
    const servers = make((async () => ok()) as typeof fetch, { burst: 2, ratePerSecond: 1, now: () => now });
    expect(await status(servers.fetch("https://amcat.nl/a"))).toBe(200);
    expect(await status(servers.fetch("https://amcat.nl/b"))).toBe(200);
    expect(await status(servers.fetch("https://amcat.nl/c"))).toBe(503); // job_server_busy
    expect(await status(servers.fetch("https://other-db.org/a"))).toBe(200); // per host
    now += 1000;
    expect(await status(servers.fetch("https://amcat.nl/d"))).toBe(200);
  });
});

describe("allowlisted db servers", () => {
  it("are reached at their configured URL; others are unknown", () => {
    const servers = new DbServers(["http://localhost:8787/", "https://amcat.nl"], fetch);
    expect(servers.urlFor("localhost:8787")).toBe("http://localhost:8787");
    expect(servers.urlFor("amcat.nl")).toBe("https://amcat.nl");
    expect(() => servers.urlFor("other.nl")).toThrow(HttpError);
  });
});
