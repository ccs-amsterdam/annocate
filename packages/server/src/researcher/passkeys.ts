import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { PasskeyRegisterSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { one } from "../db.js";
import { HttpError } from "../shared/http.js";
import { confirmSession } from "../shared/sessions.js";
import { addPasskey, newRecoveryCodes, passkeysOf, securityLog, toCredential, toPasskey, usePasskey, useRecoveryCode } from "../shared/passkeys.js";
import { requireResearcher } from "./auth.js";
import { SESSION_COOKIE } from "./login.js";

// Passkeys: the second factor for researcher access when ANNOTINDER_2FA is
// `annotinder` (docs/security.md "Second factor"). A login (the provider:
// first factor) confirms its session with a passkey here; that session then
// has `mfa`. The first passkey is added right after the first login; later
// ones need a confirmed session. Lost passkeys: recovery codes, or an admin
// reset. Never through email: the mailbox is usually the first factor.

const CHALLENGE_COOKIE = "annotinder_passkey";
const CHALLENGE_TTL_S = 5 * 60;

const secure = (c: Context) => new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";

interface Challenge {
  kind: "register" | "login";
  challenge: string;
  userId: number;
}

export function passkeys(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  // Passkeys belong to a login session (not API keys), on the server's public origin.
  const signedIn = requireResearcher(server, { withoutMfa: true });
  const confirmed = requireResearcher(server);
  const rp = () => {
    if (server.twoFactor !== "annotinder" || !server.login) throw new HttpError(404, "Passkeys are not used on this server");
    const url = new URL(server.login.publicUrl);
    return { rpID: url.hostname, origin: url.origin };
  };
  const session = (c: Context<Env>) => {
    const key = getCookie(c, SESSION_COOKIE);
    const userId = c.get("researcher").userId;
    if (!key || userId === undefined) throw new HttpError(401, "Passkeys need a login session");
    return { key, userId };
  };
  const isConfirmed = (c: Context<Env>) => c.get("researcher").mfa;

  async function setChallenge(c: Context, value: Challenge) {
    await setSignedCookie(c, CHALLENGE_COOKIE, JSON.stringify(value), server.secret, {
      path: "/auth/passkey",
      httpOnly: true,
      sameSite: "Strict",
      secure: secure(c),
      maxAge: CHALLENGE_TTL_S,
    });
  }
  async function takeChallenge(c: Context, kind: Challenge["kind"], userId: number): Promise<string> {
    const raw = await getSignedCookie(c, server.secret, CHALLENGE_COOKIE);
    deleteCookie(c, CHALLENGE_COOKIE, { path: "/auth/passkey" });
    const value = raw ? (JSON.parse(raw) as Challenge) : null;
    if (!value || value.kind !== kind || value.userId !== userId) throw new HttpError(400, "No passkey request in progress: try again", "passkey_failed");
    return value.challenge;
  }

  app.post("/auth/passkey/register/options", signedIn, async (c) => {
    const { rpID } = rp();
    const { userId } = session(c);
    const existing = await passkeysOf(db, userId);
    // The first passkey right after login; another one only from a confirmed session.
    if (existing.length > 0 && !isConfirmed(c)) throw new HttpError(403, "Confirm with a passkey you have first", "mfa_required");
    const options = await generateRegistrationOptions({
      rpName: "AnnoTinder",
      rpID,
      userName: c.get("researcher").email,
      userID: new TextEncoder().encode(`annotinder-user-${userId}`),
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports as never })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    await setChallenge(c, { kind: "register", challenge: options.challenge, userId });
    return c.json(options);
  });

  app.post("/auth/passkey/register", signedIn, async (c) => {
    const { rpID, origin } = rp();
    const { key, userId } = session(c);
    const parsed = PasskeyRegisterSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const expectedChallenge = await takeChallenge(c, "register", userId);
    const existing = await passkeysOf(db, userId);
    if (existing.length > 0 && !isConfirmed(c)) throw new HttpError(403, "Confirm with a passkey you have first", "mfa_required");
    const result = await verifyRegistrationResponse({
      response: parsed.data.response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    }).catch(() => ({ verified: false as const }));
    if (!result.verified) throw new HttpError(400, "The passkey could not be verified", "passkey_failed");
    await addPasskey(db, userId, result.registrationInfo.credential, parsed.data.name);
    await securityLog(db, userId, "passkey_added", { name: parsed.data.name });
    await confirmSession(db, key);
    // The first passkey: recovery codes, shown once.
    const recoveryCodes = existing.length === 0 ? await newRecoveryCodes(db, userId) : null;
    if (recoveryCodes) await securityLog(db, userId, "recovery_codes_made");
    return c.json({ recoveryCodes });
  });

  app.post("/auth/passkey/login/options", signedIn, async (c) => {
    const { rpID } = rp();
    const { userId } = session(c);
    const existing = await passkeysOf(db, userId);
    if (existing.length === 0) throw new HttpError(409, "Add a passkey first", "passkey_none");
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports as never })),
      userVerification: "required",
    });
    await setChallenge(c, { kind: "login", challenge: options.challenge, userId });
    return c.json(options);
  });

  app.post("/auth/passkey/login", signedIn, async (c) => {
    const { rpID, origin } = rp();
    const { key, userId } = session(c);
    const body = (await c.req.json().catch(() => undefined)) as { response?: AuthenticationResponseJSON } | undefined;
    const response = body?.response;
    if (!response?.id) throw new HttpError(400, "No passkey response");
    const expectedChallenge = await takeChallenge(c, "login", userId);
    const passkey = (await passkeysOf(db, userId)).find((p) => p.credential_id === response.id);
    if (!passkey) throw new HttpError(400, "Not a passkey of this account", "passkey_failed");
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: toCredential(passkey),
      requireUserVerification: true,
    }).catch(() => ({ verified: false as const }));
    if (!result.verified) throw new HttpError(400, "The passkey could not be verified", "passkey_failed");
    await usePasskey(db, passkey.id, result.authenticationInfo.newCounter);
    await confirmSession(db, key);
    return c.body(null, 204);
  });

  app.post("/auth/passkey/recover", signedIn, async (c) => {
    rp();
    const { key, userId } = session(c);
    const code = ((await c.req.json().catch(() => ({}))) as { code?: unknown }).code;
    if (typeof code !== "string" || !(await useRecoveryCode(db, userId, code))) {
      await securityLog(db, userId, "recovery_code_refused");
      throw new HttpError(400, "Not a recovery code of this account, or used already", "recovery_failed");
    }
    await securityLog(db, userId, "recovery_code_used");
    await confirmSession(db, key);
    return c.body(null, 204);
  });

  app.get("/me/passkeys", confirmed, async (c) => c.json((await passkeysOf(db, session(c).userId)).map(toPasskey)));

  app.delete("/me/passkeys/:id", confirmed, async (c) => {
    const { userId } = session(c);
    const all = await passkeysOf(db, userId);
    const passkey = all.find((p) => p.id === Number(c.req.param("id")));
    if (!passkey) return c.json({ error: "Passkey not found" }, 404);
    if (all.length === 1) throw new HttpError(409, "This is your only passkey: add another one first", "passkey_last");
    await db.query("DELETE FROM passkeys WHERE id = $1 AND user_id = $2", [passkey.id, userId]);
    await securityLog(db, userId, "passkey_removed", { name: passkey.name });
    return c.body(null, 204);
  });

  app.post("/me/recovery-codes", confirmed, async (c) => {
    const { userId } = session(c);
    if (!(await one(db, "SELECT 1 FROM passkeys WHERE user_id = $1", [userId]))) throw new HttpError(409, "Add a passkey first", "passkey_none");
    const recoveryCodes = await newRecoveryCodes(db, userId);
    await securityLog(db, userId, "recovery_codes_made");
    return c.json({ recoveryCodes });
  });

  return app;
}
