// The job server's identity towards db servers (plan §13): an Ed25519 key
// pair. The public keys are published at `/.well-known/jwks.json`; the
// private key signs token requests (JWS, the "private_key_jwt" pattern of
// RFC 7523). A db server verifies them with the keys it fetches, over TLS,
// from the job server URL it bound the job to.
//
// Configured as ANNOTINDER_SIGNING_KEYS: a JSON array of private JWKs. The
// first one signs; all are published, so a key can be rotated by adding a
// new one in front, and removing the old one once db servers have picked up
// the new one. `pnpm --filter @annotinder/job-server keygen` makes a key.

/** A public key as published in the JWKS. */
export interface PublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  alg: "EdDSA";
  use: "sig";
}

interface PrivateJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  d: string;
}

export class SigningKeys {
  private constructor(
    private signer: { kid: string; key: CryptoKey },
    private published: PublicJwk[],
  ) {}

  /** From ANNOTINDER_SIGNING_KEYS (a JSON array of private JWKs, the first one signs). */
  static async fromJson(json: string): Promise<SigningKeys> {
    const parsed: unknown = JSON.parse(json);
    const jwks = (Array.isArray(parsed) ? parsed : [parsed]) as PrivateJwk[];
    if (jwks.length === 0) throw new Error("ANNOTINDER_SIGNING_KEYS holds no keys");
    for (const jwk of jwks) {
      if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x || !jwk.d) {
        throw new Error("ANNOTINDER_SIGNING_KEYS: every key must be an Ed25519 private JWK (kty OKP, crv Ed25519, x, d)");
      }
    }
    const published = await Promise.all(jwks.map(publicJwk));
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwks[0].x, d: jwks[0].d }, { name: "Ed25519" }, false, ["sign"]);
    return new SigningKeys({ kid: published[0].kid, key }, published);
  }

  /** A new random key, as a private JWK (for ANNOTINDER_SIGNING_KEYS). */
  static async generate(): Promise<PrivateJwk> {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as unknown as { privateKey: CryptoKey };
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    return { kty: "OKP", crv: "Ed25519", x: jwk.x!, d: jwk.d! };
  }

  /** A key that lives only as long as this process (local development). */
  static async ephemeral(): Promise<SigningKeys> {
    return SigningKeys.fromJson(JSON.stringify([await SigningKeys.generate()]));
  }

  /** The body of `/.well-known/jwks.json`. */
  jwks(): { keys: PublicJwk[] } {
    return { keys: this.published };
  }

  /** A compact JWS (a JWT) over `payload`, signed with the current key. */
  async sign(payload: Record<string, unknown>): Promise<string> {
    const header = { alg: "EdDSA", typ: "JWT", kid: this.signer.kid };
    const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, this.signer.key, new TextEncoder().encode(input));
    return `${input}.${base64url(new Uint8Array(signature))}`;
  }
}

async function publicJwk(jwk: PrivateJwk): Promise<PublicJwk> {
  return { kty: "OKP", crv: "Ed25519", x: jwk.x, kid: await thumbprint(jwk.x), alg: "EdDSA", use: "sig" };
}

/** RFC 7638 JWK thumbprint: a stable key id, the same wherever it is computed. */
async function thumbprint(x: string): Promise<string> {
  const canonical = JSON.stringify({ crv: "Ed25519", kty: "OKP", x });
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))));
}

export function base64url(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
