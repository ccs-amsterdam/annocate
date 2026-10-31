import { createHash, randomBytes } from "node:crypto";
import type { Passkey } from "@annotinder/contracts";
import type { WebAuthnCredential } from "@simplewebauthn/server";
import type { Sql } from "../db.js";

// Passkeys and recovery codes (docs/security.md "Second factor"): storage.
// The WebAuthn ceremonies are in researcher/passkeys.ts.

interface PasskeyRow {
  id: number;
  credential_id: string;
  public_key: Uint8Array;
  counter: string | number;
  transports: string[];
  name: string;
  created: Date;
  last_used: Date | null;
}

export async function passkeysOf(sql: Sql, userId: number): Promise<PasskeyRow[]> {
  return sql.query<PasskeyRow>("SELECT * FROM passkeys WHERE user_id = $1 ORDER BY id", [userId]);
}

export const toPasskey = (row: PasskeyRow): Passkey => ({ id: row.id, name: row.name, created: row.created, lastUsed: row.last_used });

export const toCredential = (row: PasskeyRow): WebAuthnCredential => ({
  id: row.credential_id,
  publicKey: new Uint8Array(row.public_key),
  counter: Number(row.counter),
  transports: row.transports,
});

export async function addPasskey(sql: Sql, userId: number, credential: WebAuthnCredential, name: string): Promise<void> {
  await sql.query("INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, name) VALUES ($1, $2, $3, $4, $5, $6)", [
    userId,
    credential.id,
    Buffer.from(credential.publicKey),
    credential.counter,
    JSON.stringify(credential.transports ?? []),
    name,
  ]);
}

export async function usePasskey(sql: Sql, id: number, counter: number): Promise<void> {
  await sql.query("UPDATE passkeys SET counter = $2, last_used = now() WHERE id = $1", [id, counter]);
}

export async function securityLog(sql: Sql, userId: number, event: string, details: object = {}): Promise<void> {
  await sql.query("INSERT INTO security_log (user_id, event, details) VALUES ($1, $2, $3)", [userId, event, JSON.stringify(details)]);
}

const hashCode = (code: string) => createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");

/** 10 new recovery codes (`xxxx-xxxx-xxxx`), replacing the old ones; stored hashed, returned once. */
export async function newRecoveryCodes(sql: Sql, userId: number): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => (randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").match(/.{4}/g) ?? []).join("-"));
  await sql.query("DELETE FROM recovery_codes WHERE user_id = $1", [userId]);
  await sql.query("INSERT INTO recovery_codes (user_id, code_hash) SELECT $1, unnest($2::text[])", [userId, codes.map(hashCode)]);
  return codes;
}

/** Uses a recovery code (once); false if it isn't one of the user's unused codes. */
export async function useRecoveryCode(sql: Sql, userId: number, code: string): Promise<boolean> {
  const used = await sql.query("UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING user_id", [
    userId,
    hashCode(code),
  ]);
  return used.length > 0;
}
