import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

// How a db server issues job tokens (contracts `JobTokenRequestSchema`, plan
// §13). Exported for db servers written in TypeScript; for other languages,
// this file is the reference to port.
//
// A job server asks with a JWT it signed with its own key (Ed25519). The db
// server checks that the job runs on that job server, verifies the signature
// with the job server's published keys (`/.well-known/jwks.json`, fetched
// over TLS from the URL the job is bound to), and answers with a job token it
// signs itself. Nothing is stored: job tokens and call keys can be recomputed
// or checked from the db server's secret alone.

/** A public key from a job server's JWKS (only Ed25519 keys are used). */
interface Jwk {
  kty?: string;
  crv?: string;
  x?: string;
  kid?: string;
}

export interface JobTokenIssuerOptions {
  /** The db server's secret: signs job tokens and derives call keys. */
  secret: string;
  /** This db server's own URL, as job servers address it (the `aud` they sign). */
  publicUrl: string;
  /** Fetches job servers' JWKS. A real db server should only allow https here. */
  fetch?: typeof fetch;
  now?: () => number;
  /** How long a job token is valid. */
  tokenTtlMs?: number;
}

export type IssueResult = { token: string; expiresAt: Date } | { error: string };

/** Longest validity a job server may give its own request (`exp - iat`). */
const MAX_ASSERTION_S = 5 * 60;
/** Clock difference tolerated between the servers. */
const SKEW_S = 60;
/** JWKS are cached; a key id that isn't in the cache triggers a refetch, at most this often. */
const JWKS_TTL_MS = 10 * 60_000;

export class JobTokenIssuer {
  private jwks = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
  private fetchImpl: typeof fetch;
  private now: () => number;

  constructor(private options: JobTokenIssuerOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
  }

  /**
   * Checks a job server's request for job `jobId`. `boundJobServer` is the
   * job server URL the db server deployed this job to (it must store that),
   * or null if the job isn't deployed.
   */
  async issue(jobId: number, assertion: string, boundJobServer: string | null): Promise<IssueResult> {
    const parts = assertion.split(".");
    if (parts.length !== 3) return { error: "Malformed assertion" };
    const header = decodeJson(parts[0]);
    const claims = decodeJson(parts[1]);
    if (!header || !claims || header.alg !== "EdDSA" || typeof header.kid !== "string") {
      return { error: "Malformed assertion" };
    }

    // 1. The claims: this job, this db server, the job server it is bound to, a short valid window.
    const nowS = Math.floor(this.now() / 1000);
    const { iss, aud, iat, exp } = claims;
    if (boundJobServer === null) return { error: "Job is not deployed" };
    if (claims.jobId !== jobId) return { error: "Assertion is for another job" };
    if (aud !== this.options.publicUrl) return { error: "Assertion is for another db server" };
    if (iss !== boundJobServer) return { error: "Job is not deployed to this job server" };
    if (typeof iat !== "number" || typeof exp !== "number") return { error: "Assertion has no valid time window" };
    if (exp <= nowS || iat > nowS + SKEW_S || exp - iat > MAX_ASSERTION_S) return { error: "Assertion expired or not yet valid" };

    // 2. The signature, with the job server's published key.
    const jwk = await this.key(boundJobServer, header.kid);
    if (!jwk) return { error: "Unknown signing key" };
    const valid = verify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    );
    if (!valid) return { error: "Invalid signature" };

    // 3. The job token.
    const expiresAt = this.now() + (this.options.tokenTtlMs ?? 60 * 60_000);
    const token = this.sign({ jobId, aud: boundJobServer, iat: nowS, exp: Math.floor(expiresAt / 1000), ck: this.callKey(boundJobServer, jobId) });
    return { token, expiresAt: new Date(expiresAt) };
  }

  /** Checks a job token (on every backend call); returns its claims, or null. */
  verifyToken(token: string): { jobId: number; aud: string; exp: number; ck: string } | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const expected = this.hmac(`${parts[0]}.${parts[1]}`);
    const given = Buffer.from(parts[2], "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = decodeJson(parts[1]) as { jobId: number; aud: string; exp: number; ck: string } | null;
    if (!claims || typeof claims.exp !== "number" || claims.exp * 1000 <= this.now()) return null;
    return claims;
  }

  /** The key for calls to the job server about this job (plan §13); recomputed, never stored. */
  callKey(jobServerUrl: string, jobId: number): string {
    return createHmac("sha256", this.options.secret).update(`calls|${jobServerUrl}|${jobId}`).digest("base64url");
  }

  private sign(claims: Record<string, unknown>): string {
    const input = `${encodeJson({ alg: "HS256", typ: "JWT" })}.${encodeJson(claims)}`;
    return `${input}.${this.hmac(input).toString("base64url")}`;
  }

  private hmac(input: string): Buffer {
    return createHmac("sha256", this.options.secret).update(input).digest();
  }

  /** A job server's public key by id, from its JWKS (cached; refetched for an unknown id). */
  private async key(jobServerUrl: string, kid: string): Promise<Jwk | undefined> {
    const find = () => this.jwks.get(jobServerUrl)?.keys.find((k) => k.kid === kid && k.kty === "OKP" && k.crv === "Ed25519");
    const cached = this.jwks.get(jobServerUrl);
    if (find() && cached && this.now() - cached.fetchedAt < JWKS_TTL_MS) return find();
    // A key id we don't know: refetch, but not more than once a minute per job server.
    if (cached && !find() && this.now() - cached.fetchedAt < 60_000) return undefined;
    try {
      const res = await this.fetchImpl(`${jobServerUrl.replace(/\/$/, "")}/.well-known/jwks.json`, { redirect: "error" });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys)) return undefined;
      this.jwks.set(jobServerUrl, { keys: body.keys as Jwk[], fetchedAt: this.now() });
    } catch {
      return undefined;
    }
    return find();
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString());
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
