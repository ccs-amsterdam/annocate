import { HttpCoderApi } from "../api/httpCoderApi";

// Device-side half of docs/coder-identity.md §4. The session itself lives in
// an httpOnly cookie the server sets (one per deployment and participant
// id, which the invite takes from a URL parameter), so this code never sees it: page scripts can't leak it.
// A session only moves to another device through a one-time transfer link.
// A participant id or invite link alone never resumes an earlier session.

/** Which session a page belongs to; sent along so the server picks the right cookie. */
export interface CoderSessionScope {
  /** Server base URL including the deployment, e.g. `/d/42` (same origin as the client). */
  baseUrl: string;
  inviteSecret?: string;
}

/**
 * Redeems a transfer token (from "Continue on another device"): the server
 * sets this device's session cookie for `scope`.
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

/** Default transfer link: the current page URL with `transfer=<token>` and without invite/participant params. */
export function defaultTransferUrl(token: string): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  url.searchParams.delete("participant");
  url.searchParams.set("transfer", token);
  return url.toString();
}

// Coder login (docs/coder-identity.md §5): the same login as researchers',
// on this origin. A logged-in coder's session is found by the login on any
// device, so it needs no cookie or transfer link.

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
