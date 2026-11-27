import type { SignIn } from "@annotinder/contracts";
import { CLIENT_HEADERS, HttpCoderApi } from "../api/httpCoderApi";

// Device-side half of docs/coder-identity.md §4. The device id lives in one
// httpOnly cookie for all studies (`annotinder_device`), so this code never
// sees it: page scripts can't leak it. The server derives this study's
// session key from it, the deployment and the coder id. A session
// only moves to another device through a one-time transfer link (or a
// login). A coder id or link alone never resumes an earlier
// session.

/** Which study and link a page belongs to. */
export interface CoderSessionScope {
  /** Server base URL including the deployment, e.g. `/api/d/k3v9x2m4q7ta` (same origin as the client). */
  baseUrl: string;
  linkSecret?: string;
}

/**
 * Transfer tokens work once, so a remount (or React StrictMode running
 * effects twice) reuses the same redemption rather than redeem again.
 */
const redemptions = new Map<string, Promise<void>>();

/**
 * Redeems a transfer token (from "Continue on another device"): the server
 * adds this device to the session (and gives it a device cookie if it has
 * none).
 */
export function redeemTransfer(scope: CoderSessionScope, token: string): Promise<void> {
  let pending = redemptions.get(token);
  if (!pending) {
    pending = HttpCoderApi.redeemTransfer(scope, token);
    redemptions.set(token, pending);
  }
  return pending;
}

/**
 * Default transfer link: this page with only the deployment and
 * `transfer=<token>` (the session has the rest; a coder id stays out
 * of the link).
 */
export function defaultTransferUrl(token: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("transfer", token);
  return url.toString();
}

// Coder login (docs/coder-identity.md §5): the same login as researchers',
// on this origin. A logged-in coder continues on another device by logging
// in there, without a transfer link.

/**
 * A study page's address (path and query) with the coder's choice to code
 * with their account: `login=1`. The page reads it once, sends
 * `x-use-login` from then on, and takes it out of the address (CodePage),
 * so a copied link never carries the choice to someone else.
 */
export function withLoginChoice(address: string): string {
  const [path, query = ""] = address.split("?");
  const params = new URLSearchParams(query);
  params.set("login", "1");
  return `${path}?${params.toString()}`;
}

/**
 * Where the browser goes to log in; it comes back to this page.
 * `useLogin`: the coder chose to sign in where the study doesn't require
 * it, so the page they come back to codes with their account.
 */
export function coderLoginUrl({ useLogin = false }: { useLogin?: boolean } = {}): string {
  const page = window.location.pathname + window.location.search;
  return `/api/auth/login?returnTo=${encodeURIComponent(useLogin ? withLoginChoice(page) : page)}`;
}

/**
 * The coder chose to code with their account: logs in and comes back to
 * this page, which then continues the account's session in this study.
 */
export function logInWithAccount(): void {
  window.location.assign(coderLoginUrl({ useLogin: true }));
}

/**
 * Whether a coding screen says "Sign in here too" (`SignInHereLine`): its
 * device joined the session by a transfer link, signing in is possible in
 * the study, and the browser isn't logged in (`loggedIn` null: not known
 * yet).
 */
export function offersSignInHere(joinedByTransfer: boolean, signIn: SignIn, loggedIn: boolean | null): boolean {
  return joinedByTransfer && signIn !== "none" && loggedIn === false;
}

/** Whether this server offers login at all. */
export async function loginAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/options", { credentials: "same-origin" });
    return res.ok && ((await res.json()) as { login?: boolean }).login === true;
  } catch {
    return false;
  }
}

/** Where the browser goes on once the login provider's logout brings it back to the start page. */
const AFTER_LOGOUT_KEY = "annotinder_after_logout";

/**
 * Logs out, also at the login provider (so it doesn't sign the same account
 * in again), then logs in again and comes back to this page. The provider
 * sends the browser back to the start page, which goes on to the login
 * (`continueAfterLogout`).
 */
export async function logInWithAnotherAccount(): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST", headers: CLIENT_HEADERS, credentials: "same-origin" });
  const { redirect } = res.ok ? ((await res.json()) as { redirect: string | null }) : { redirect: null };
  const login = coderLoginUrl();
  if (redirect && remember(login)) window.location.assign(redirect);
  else window.location.assign(login);
}

function remember(login: string): boolean {
  try {
    sessionStorage.setItem(AFTER_LOGOUT_KEY, login);
    return true;
  } catch {
    return false;
  }
}

/**
 * On the start page: if the provider's logout brought the browser back here
 * on its way to a login (`logInWithAnotherAccount`), goes on to it. Only a
 * login of this server, once.
 */
export function continueAfterLogout(): void {
  const login = takeRemembered();
  if (login?.startsWith("/api/auth/login?")) window.location.replace(login);
}

function takeRemembered(): string | null {
  try {
    const login = sessionStorage.getItem(AFTER_LOGOUT_KEY);
    sessionStorage.removeItem(AFTER_LOGOUT_KEY);
    return login;
  } catch {
    return null;
  }
}

/**
 * A coder link's URL (`/code/<publicId>?link=<secret>`): what researchers
 * send coders (docs/coder-identity.md). `publicId`: the study's public id,
 * not its sequential id.
 */
export function codeLinkUrl(publicId: string, secret: string): string {
  return `${window.location.origin}/code/${publicId}?link=${encodeURIComponent(secret)}`;
}
