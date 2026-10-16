import { HttpError } from "./backend.js";

// Which db servers this job server works for, and how it talks to them
// (plan §13). A deployment id is `<db host>/<jobId>` (a researcher preview:
// `<db host>/<jobId>.preview`), so a job server that forgot a job finds the
// db server again from the URL alone.
//
// - Allowlist: only the listed db servers (their URLs as given, so
//   `http://localhost:8787` works for development).
// - Open (`"open"`): any db server at `https://<host>`, our public job
//   servers. Nobody is vetted; the coder UI shows who hosts a job.
//
// Every outbound call goes through `fetch` here: no redirects, a timeout, a
// response size cap, and a request cap per db host, so nobody can use a job
// server to hammer a third party. The cap is per process (Node) or per
// Durable Object (Cloudflare; a shared counter would need its own object).

export type DbServerPolicy = string[] | "open";

export interface DbServerOptions {
  /** Requests per second per db host, sustained, and the burst on top. */
  ratePerSecond: number;
  burst: number;
  timeoutMs: number;
  maxResponseBytes: number;
  /**
   * Open mode only: refuse hosts that resolve to private addresses (Node:
   * index.ts). Not needed on Cloudflare, whose fetch can't reach private networks.
   */
  checkHost?: (host: string) => Promise<boolean>;
  now: () => number;
}

export const DEFAULT_DB_SERVER_OPTIONS: DbServerOptions = {
  ratePerSecond: 50,
  burst: 200,
  timeoutMs: 15_000,
  maxResponseBytes: 32 * 2 ** 20,
  now: () => Date.now(),
};

/** Splits `<host>/<jobId>` or `<host>/<jobId>.preview`. */
export function parseDeploymentId(id: string): { host: string; jobId: number; preview: boolean } | null {
  const match = /^([^/]+)\/(\d+)(\.preview)?$/.exec(id);
  if (!match) return null;
  return { host: match[1].toLowerCase(), jobId: Number(match[2]), preview: !!match[3] };
}

/** A host an open job server may contact: a DNS name with a dot, no port, not an IP literal or a local name. */
export function isPublicHostname(host: string): boolean {
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/.test(host)) return false;
  return !/(^|\.)(localhost|local|internal|localdomain|home|lan|test|invalid|example)$/.test(host);
}

export class DbServers {
  private allowed: Map<string, string> | null;
  private buckets = new Map<string, { tokens: number; at: number }>();
  private hostChecks = new Map<string, { ok: boolean; at: number }>();

  constructor(
    policy: DbServerPolicy,
    private fetchImpl: typeof fetch,
    private options: DbServerOptions = DEFAULT_DB_SERVER_OPTIONS,
  ) {
    this.allowed =
      policy === "open" ? null : new Map(policy.map((url) => [new URL(url).host.toLowerCase(), url.replace(/\/$/, "")]));
  }

  /** The db server URL for a deployment's host; 404 if this job server doesn't work for it. */
  urlFor(host: string): string {
    if (this.allowed) {
      const url = this.allowed.get(host);
      if (!url) throw new HttpError(404, `Unknown db server '${host}'`);
      return url;
    }
    if (!isPublicHostname(host)) throw new HttpError(404, `Not a db server this job server can reach: '${host}'`);
    return `https://${host}`;
  }

  /** `fetch` for calls to db servers, with the limits above. */
  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const host = url.host.toLowerCase();
    if (!this.take(host)) throw new HttpError(503, "This job server is busy; please try again later", "job_server_busy");
    if (!this.allowed && this.options.checkHost && !(await this.checked(host))) {
      throw new HttpError(404, `Not a db server this job server can reach: '${host}'`);
    }
    // "manual" and refusing redirects ourselves: Workers don't support redirect: "error".
    const res = await this.fetchImpl(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      throw new HttpError(502, `Db server answered with a redirect (${res.status}); redirects aren't followed`);
    }
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > this.options.maxResponseBytes) {
      await res.body?.cancel();
      throw new HttpError(502, `Db server response too large (${length} bytes)`);
    }
    return res;
  };

  /** Token bucket per host. */
  private take(host: string): boolean {
    const now = this.options.now();
    const bucket = this.buckets.get(host) ?? { tokens: this.options.burst, at: now };
    bucket.tokens = Math.min(this.options.burst, bucket.tokens + ((now - bucket.at) / 1000) * this.options.ratePerSecond);
    bucket.at = now;
    this.buckets.set(host, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  private async checked(host: string): Promise<boolean> {
    const cached = this.hostChecks.get(host);
    if (cached && this.options.now() - cached.at < 5 * 60_000) return cached.ok;
    const ok = await this.options.checkHost!(host).catch(() => false);
    this.hostChecks.set(host, { ok, at: this.options.now() });
    return ok;
  }
}
