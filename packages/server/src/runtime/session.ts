import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { HttpError } from "../shared/http.js";

// Coder sessions (docs/coder-identity.md §4): a browser keeps one random
// device id in an httpOnly cookie, for every job, so page scripts (and XSS)
// never see it. Its key for a session in a job is the hash of the device id,
// the deployment and the participant id (a shared lab computer keeps
// participants apart). The database stores only that hash, never the device
// id: so nothing links one device's sessions across jobs.

/** Every coder API request must carry this header: a cross-site form or image can't, so it blocks CSRF. */
export const CLIENT_HEADER = "x-annotinder";

const DEVICE_COOKIE = "annotinder_device";

/** Cookies live for as long as browsers allow (400 days in Chrome). */
const MAX_AGE_S = 400 * 24 * 60 * 60;

export function requireClientHeader(c: Context): void {
  if (c.req.header(CLIENT_HEADER) !== "1") throw new HttpError(403, `Missing ${CLIENT_HEADER} header`);
}

/** This browser's device id, if it has one. */
export function readDevice(c: Context): string | undefined {
  return getCookie(c, DEVICE_COOKIE);
}

export function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sets (or renews) the device cookie, for the whole coder API. */
export function writeDevice(c: Context, deviceId: string): void {
  setCookie(c, DEVICE_COOKIE, deviceId, {
    path: "/d",
    httpOnly: true,
    sameSite: "Lax",
    // Plain http only in local development (behind a TLS proxy: its X-Forwarded-Proto).
    secure: new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https",
    maxAge: MAX_AGE_S,
  });
}

/** A device's key for its session in a deployment (with this participant id, if the link carries one). */
export function coderKey(deviceId: string, deploymentId: string, participantId?: string | null): Promise<string> {
  return sha256(`${deviceId}\n${deploymentId}\n${participantId ?? ""}`);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
