import { HttpJobServer } from "../api/httpJobServer";

// Device-side half of docs/coder-identity.md §4. The session itself lives in
// an httpOnly cookie the server sets (one per deployment, invite and
// participant id), so this code never sees it: page scripts can't leak it.
// A session only moves to another device through a one-time transfer link.
// A participant id or invite link alone never resumes an earlier session.

/** Which session a page belongs to; sent along so the server picks the right cookie. */
export interface CoderSessionScope {
  /** Server base URL including the deployment, e.g. `/d/42` (same origin as the client). */
  baseUrl: string;
  inviteSecret?: string;
  participantId?: string;
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
    pending = HttpJobServer.redeemTransfer(scope, token);
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
