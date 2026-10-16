import { JobTokenResponseSchema, backendEndpoints } from "@annotinder/contracts";
import { HttpError } from "./backend.js";
import { base64url, type SigningKeys } from "./keys.js";

// A job token per (db server, job), plan §13: requested with a JWT this job
// server signs, renewed before it expires, and renewed early if the db server
// rejects it (e.g. after rotating its secret). Its `ck` claim is the call key
// the db server signs its calls to us with.

/** Renew this long before a token expires. */
const RENEW_MARGIN_MS = 5 * 60_000;

export interface JobTokenOptions {
  /** This job server's own URL, as db servers bind jobs to it (`iss`). */
  publicUrl: string;
  /** The db server's URL (`aud`), as configured. */
  dbUrl: string;
  jobId: number;
  keys: Promise<SigningKeys>;
  fetch: typeof fetch;
  /** The wall clock: assertions are checked against the db server's clock. */
  now?: () => number;
}

export class JobTokens {
  private current: { token: string; expiresAt: number; callKey: string } | null = null;
  private pending: Promise<string> | null = null;

  constructor(private options: JobTokenOptions) {}

  /** A valid job token, requested if there is none (single-flight). */
  async token(): Promise<string> {
    if (this.current && this.current.expiresAt - RENEW_MARGIN_MS > (this.options.now ?? Date.now)()) return this.current.token;
    this.pending ??= this.request().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** Forget the token, e.g. because the db server rejected it; the next call gets a new one. */
  invalidate(rejected: string): void {
    if (this.current?.token === rejected) this.current = null;
  }

  /** The key the db server signs its calls about this job with (from the token's `ck` claim). */
  async callKey(): Promise<string> {
    await this.token();
    return this.current!.callKey;
  }

  private async request(): Promise<string> {
    const { publicUrl, dbUrl, jobId } = this.options;
    const now = this.options.now ?? Date.now;
    const iat = Math.floor(now() / 1000);
    const assertion = await (await this.options.keys).sign({
      iss: publicUrl,
      aud: dbUrl,
      jobId,
      iat,
      exp: iat + 120,
      jti: crypto.randomUUID(),
    });
    const url = dbUrl + backendEndpoints.requestJobToken.path.replace(":jobId", String(jobId));
    let res: Response;
    try {
      res = await this.options.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assertion }),
      });
    } catch (err) {
      throw new HttpError(502, `Db server unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status === 404) throw new HttpError(404, "Job not found");
    if (!res.ok) {
      // A 401 here is a configuration problem (job not bound to us, keys, URLs), not the coder's.
      throw new HttpError(502, `Db server refused a job token (${res.status}): ${await res.text()}`);
    }
    const parsed = JobTokenResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new HttpError(502, "Db server returned an invalid job token response");
    const { token, expiresAt } = parsed.data;
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { ck?: unknown };
    if (typeof claims.ck !== "string") throw new HttpError(502, "Db server's job token has no call key");
    this.current = { token, expiresAt: expiresAt.getTime(), callKey: claims.ck };
    return token;
  }
}

/**
 * Checks a db server's signature on a call to this job server (contracts
 * `JOB_SERVER_SIGNATURE_HEADER`): `t=<unix seconds>,s=<HMAC>`, at most 5
 * minutes off.
 */
export async function verifyCallSignature(
  header: string | undefined,
  callKey: string,
  call: { method: string; path: string; body: string },
  now: number,
): Promise<boolean> {
  const match = /^t=(\d+),s=([A-Za-z0-9_-]+)$/.exec(header ?? "");
  if (!match || Math.abs(Number(match[1]) - now / 1000) > 300) return false;
  const expected = await hmac(callKey, `${match[1]}\n${call.method}\n${call.path}\n${call.body}`);
  return timingSafeEqual(base64url(expected), match[2]);
}

/** HMAC-SHA256 with a call key, as raw bytes. */
export async function hmac(key: string, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
