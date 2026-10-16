import { createHash, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SigningKeys, type PublicJwk } from "../keys.js";

// What a db server does (plan §13): verify a job server's JWS with a key from
// its JWKS. Done here with node:crypto, independently of keys.ts (WebCrypto).
function verifyJws(jws: string, jwks: { keys: PublicJwk[] }) {
  const [header64, payload64, signature64] = jws.split(".");
  const header = JSON.parse(Buffer.from(header64, "base64url").toString());
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== "EdDSA") return null;
  const key = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: "jwk" });
  const ok = verify(null, Buffer.from(`${header64}.${payload64}`), key, Buffer.from(signature64, "base64url"));
  return ok ? JSON.parse(Buffer.from(payload64, "base64url").toString()) : null;
}

describe("SigningKeys", () => {
  it("signs JWTs that verify with the published key, and publishes no private parts", async () => {
    const keys = await SigningKeys.ephemeral();
    const jwks = keys.jwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).not.toHaveProperty("d");
    expect(jwks.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig" });

    const jws = await keys.sign({ iss: "https://jobs.example", jobId: 42 });
    expect(verifyJws(jws, jwks)).toEqual({ iss: "https://jobs.example", jobId: 42 });

    const tampered = jws.replace(/\.[^.]+\./, `.${Buffer.from(JSON.stringify({ iss: "https://evil.example", jobId: 42 })).toString("base64url")}.`);
    expect(verifyJws(tampered, jwks)).toBeNull();
  });

  it("uses the RFC 7638 thumbprint as key id", async () => {
    const jwk = await SigningKeys.generate();
    const keys = await SigningKeys.fromJson(JSON.stringify([jwk]));
    const thumbprint = createHash("sha256").update(JSON.stringify({ crv: "Ed25519", kty: "OKP", x: jwk.x })).digest("base64url");
    expect(keys.jwks().keys[0].kid).toBe(thumbprint);
  });

  it("publishes every configured key and signs with the first (rotation)", async () => {
    const [next, current] = [await SigningKeys.generate(), await SigningKeys.generate()];
    const keys = await SigningKeys.fromJson(JSON.stringify([next, current]));
    const jwks = keys.jwks();
    expect(jwks.keys.map((k) => k.x)).toEqual([next.x, current.x]);
    const jws = await keys.sign({ a: 1 });
    expect(JSON.parse(Buffer.from(jws.split(".")[0], "base64url").toString()).kid).toBe(jwks.keys[0].kid);
    expect(verifyJws(jws, { keys: [jwks.keys[1]] })).toBeNull(); // not signed with the old key
    expect(verifyJws(jws, jwks)).toEqual({ a: 1 });
  });

  it("refuses keys that aren't Ed25519 private JWKs", async () => {
    const { x } = await SigningKeys.generate();
    await expect(SigningKeys.fromJson(JSON.stringify([{ kty: "OKP", crv: "Ed25519", x }]))).rejects.toThrow(/private JWK/);
    await expect(SigningKeys.fromJson("[]")).rejects.toThrow(/no keys/);
  });
});
