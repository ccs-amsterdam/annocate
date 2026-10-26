import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { Hono } from "hono";

// A minimal OpenID Connect provider for tests, reached through `fetch`
// (no sockets): discovery, JWKS and a token endpoint. The authorization
// step is the test's: it reads the login redirect and calls `approve` with
// the claims the "user" logs in with, getting the code the provider would
// send back.

export const ISSUER = "https://idp.test";
export const CLIENT_ID = "annotinder";
export const CLIENT_SECRET = "s3cret";

interface Grant {
  claims: Record<string, unknown>;
  nonce: string;
  challenge: string;
  redirectUri: string;
}

export function mockIssuer() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" };
  const grants = new Map<string, Grant>();
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

  const idToken = (claims: Record<string, unknown>) => {
    const input = `${b64({ alg: "ES256", kid: "k1", typ: "JWT" })}.${b64(claims)}`;
    return `${input}.${sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };

  const app = new Hono();
  app.get("/.well-known/openid-configuration", (c) =>
    c.json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      code_challenge_methods_supported: ["S256"],
    }),
  );
  app.get("/jwks", (c) => c.json({ keys: [jwk] }));
  app.post("/token", async (c) => {
    const form = await c.req.parseBody();
    const grant = grants.get(String(form.code));
    grants.delete(String(form.code));
    const verifier = String(form.code_verifier ?? "");
    if (
      !grant ||
      form.client_id !== CLIENT_ID ||
      form.client_secret !== CLIENT_SECRET ||
      form.redirect_uri !== grant.redirectUri ||
      createHash("sha256").update(verifier).digest("base64url") !== grant.challenge
    ) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    return c.json({
      access_token: "at",
      token_type: "Bearer",
      expires_in: 300,
      id_token: idToken({ iss: ISSUER, aud: CLIENT_ID, sub: "user-1", iat: now, exp: now + 300, nonce: grant.nonce, ...grant.claims }),
    });
  });

  return {
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      return app.request(url.pathname + url.search, input instanceof Request ? input : init);
    }) as typeof fetch,
    /** The user logs in at `authorizeUrl` (the server's redirect) with these claims; returns the code. */
    approve(authorizeUrl: string, claims: Record<string, unknown>): { code: string; state: string } {
      const url = new URL(authorizeUrl);
      const code = randomBytes(16).toString("hex");
      grants.set(code, {
        claims,
        nonce: url.searchParams.get("nonce")!,
        challenge: url.searchParams.get("code_challenge")!,
        redirectUri: url.searchParams.get("redirect_uri")!,
      });
      return { code, state: url.searchParams.get("state")! };
    },
  };
}
