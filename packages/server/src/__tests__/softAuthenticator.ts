import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";

// A software passkey for tests: makes WebAuthn registration and
// authentication responses (attestation "none", ES256) as a browser would,
// so the server verifies real signatures.

const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest();

export function softAuthenticator(origin: string) {
  const rpID = new URL(origin).hostname;
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const credentialId = randomBytes(16);
  let counter = 0;

  const clientData = (type: string, challenge: string) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  const counterBytes = () => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(++counter);
    return b;
  };

  return {
    id: b64url(credentialId),
    /** A response to `navigator.credentials.create` with these options. */
    register(options: { challenge: string }) {
      const cose = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x, "base64url")],
          [-3, Buffer.from(jwk.y, "base64url")],
        ]),
      );
      const length = Buffer.alloc(2);
      length.writeUInt16BE(credentialId.length);
      // rpIdHash | flags (user present, verified, attested data) | counter | aaguid | id length | id | public key
      const authData = Buffer.concat([sha256(rpID), Buffer.from([0x45]), counterBytes(), Buffer.alloc(16), length, credentialId, Buffer.from(cose)]);
      const attestationObject = isoCBOR.encode(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]) as never);
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        response: { clientDataJSON: b64url(clientData("webauthn.create", options.challenge)), attestationObject: b64url(attestationObject), transports: ["internal"] },
        clientExtensionResults: {},
      };
    },
    /** A response to `navigator.credentials.get` with these options. */
    authenticate(options: { challenge: string }) {
      const authData = Buffer.concat([sha256(rpID), Buffer.from([0x05]), counterBytes()]);
      const data = clientData("webauthn.get", options.challenge);
      const signature = sign("sha256", Buffer.concat([authData, sha256(data)]), privateKey);
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        response: { clientDataJSON: b64url(data), authenticatorData: b64url(authData), signature: b64url(signature) },
        clientExtensionResults: {},
      };
    },
  };
}
