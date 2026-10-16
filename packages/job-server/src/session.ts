import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { HttpError } from "./backend.js";

// Coder sessions (docs/coder-identity.md §4, plan §2): the job server makes
// a random session key per job session and keeps it in an httpOnly cookie,
// so page scripts (and XSS) never see it. The db server only ever gets a
// hash of it, as the coder key it stores.

/** Every coder API request must carry this header: a cross-site form or image can't, so it blocks CSRF. */
export const CLIENT_HEADER = "x-annotinder";

/** Cookies live for as long as browsers allow (400 days in Chrome). */
const MAX_AGE_S = 400 * 24 * 60 * 60;

export function requireClientHeader(c: Context): void {
  if (c.req.header(CLIENT_HEADER) !== "1") throw new HttpError(403, `Missing ${CLIENT_HEADER} header`);
}

/**
 * The session cookie's name. The deployment is in the cookie's path; a
 * device keeps separate sessions per participant id (a shared lab computer
 * running a panel), so that is part of the name. The invite isn't: once a
 * coder started, they come back without it (plan §13).
 */
export async function sessionCookieName(participantId?: string): Promise<string> {
  return `annotinder_${(await sha256(participantId ?? "")).slice(0, 16)}`;
}

export function newSessionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** What the db server stores for a session key: a db leak doesn't hand out sessions. */
export function backendCoderKey(sessionKey: string): Promise<string> {
  return sha256(sessionKey);
}

export function readSession(c: Context, name: string): string | undefined {
  return getCookie(c, name);
}

export function writeSession(c: Context, deploymentId: string, name: string, sessionKey: string): void {
  setCookie(c, name, sessionKey, {
    path: `/d/${deploymentId}`,
    httpOnly: true,
    sameSite: "Lax",
    // Plain http only in local development.
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: MAX_AGE_S,
  });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
