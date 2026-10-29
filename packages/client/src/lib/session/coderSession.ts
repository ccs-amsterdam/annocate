import { HttpCoderApi } from "../api/httpCoderApi";

// Device-side half of docs/coder-identity.md §4. The device id lives in one
// httpOnly cookie for all jobs (`annotinder_device`), so this code never
// sees it: page scripts can't leak it. The server derives this job's
// session key from it, the deployment and the participant id. A session
// only moves to another device through a one-time transfer link (or a
// login). A participant id or invite link alone never resumes an earlier
// session.

/** Which job and invite a page belongs to. */
export interface CoderSessionScope {
  /** Server base URL including the deployment, e.g. `/d/42` (same origin as the client). */
  baseUrl: string;
  inviteSecret?: string;
}

/**
 * Redeems a transfer token (from "Continue on another device"): the server
 * adds this device to the session (and gives it a device cookie if it has
 * none).
 */
export function redeemTransfer(scope: CoderSessionScope, token: string): Promise<void> {
  // Tokens work once, so a remount (or React StrictMode running effects
  // twice) must reuse the same redemption rather than redeem again.
  let pending = redemptions.get(token);
  if (!pending) {
    pending = HttpCoderApi.redeemTransfer(scope, token);
    redemptions.set(token, pending);
  }
  return pending;
}

const redemptions = new Map<string, Promise<void>>();

/**
 * Default transfer link: this page with only the deployment and
 * `transfer=<token>` (the session has the rest; a participant id stays out
 * of the link).
 */
export function defaultTransferUrl(token: string): string {
  const url = new URL(window.location.href);
  const deployment = url.searchParams.get("deployment");
  url.search = "";
  if (deployment) url.searchParams.set("deployment", deployment);
  url.searchParams.set("transfer", token);
  return url.toString();
}

// Coder login (docs/coder-identity.md §5): the same login as researchers',
// on this origin. A logged-in coder continues on another device by logging
// in there, without a transfer link.

/** Where the browser goes to log in; it comes back to this page. */
export function coderLoginUrl(): string {
  return `/auth/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

/** Whether this server offers login at all. */
export async function loginAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/auth/options", { credentials: "same-origin" });
    return res.ok && ((await res.json()) as { login?: boolean }).login === true;
  } catch {
    return false;
  }
}

/** Logs out (to log in with another account). */
export async function logOut(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", headers: { "x-annotinder": "1" }, credentials: "same-origin" });
}
