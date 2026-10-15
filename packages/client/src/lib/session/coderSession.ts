import { HttpJobServer } from "../api/httpJobServer";

// Device-side half of docs/coder-identity.md §4: a coder key is created on
// the device, stored there, and only ever moves to another device through a
// one-time transfer link. A participant id or invite link alone never
// resumes an earlier session.

/** What a stored coder key belongs to. A shared device keeps separate sessions per invite/participant. */
export interface CoderSessionScope {
  /** Job server base URL including the deployment, e.g. `https://jobs.example/d/mock.1`. */
  baseUrl: string;
  inviteSecret?: string;
  participantId?: string;
}

const PREFIX = "annotinder:coder-key:";

function storageKey(scope: CoderSessionScope): string {
  return PREFIX + JSON.stringify([scope.baseUrl, scope.inviteSecret ?? "", scope.participantId ?? ""]);
}

// Storage can be unavailable (private mode, blocked site data); sessions then
// simply don't survive a reload.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function newCoderKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The coder key stored for this scope, creating (and storing) a new one if there is none. */
export function getOrCreateCoderKey(scope: CoderSessionScope): string {
  const key = storageKey(scope);
  const existing = read(key);
  if (existing) return existing;
  const created = newCoderKey();
  write(key, created);
  return created;
}

/** Replaces the stored coder key for a scope, e.g. to start a new session. */
export function storeCoderKey(scope: CoderSessionScope, coderKey: string): void {
  write(storageKey(scope), coderKey);
}

/**
 * Redeems a transfer token (from "Continue on another device") and stores
 * the resulting coder key for `scope`, so reloads keep using it.
 */
export function redeemTransfer(scope: CoderSessionScope, token: string): Promise<string> {
  // Tokens work once, so a remount (or React StrictMode running effects
  // twice) must reuse the same redemption rather than redeem again.
  let pending = redemptions.get(token);
  if (!pending) {
    pending = HttpJobServer.redeemTransfer(scope.baseUrl, token).then((coderKey) => {
      storeCoderKey(scope, coderKey);
      return coderKey;
    });
    redemptions.set(token, pending);
  }
  return pending;
}

const redemptions = new Map<string, Promise<string>>();

/** Default transfer link: the current page URL with `transfer=<token>` and without invite/participant params. */
export function defaultTransferUrl(token: string): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  url.searchParams.delete("participant");
  url.searchParams.set("transfer", token);
  return url.toString();
}
