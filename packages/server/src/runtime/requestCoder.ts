import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { own, type SignIn } from "@annotinder/contracts";
import type { Server } from "../context.js";
import { SESSION_COOKIE } from "../researcher/login.js";
import { deviceDetails } from "../shared/devices.js";
import type { User } from "../shared/accounts.js";
import { HttpError } from "../shared/http.js";
import { crowdSignInAllowed } from "../shared/limits.js";
import { linkInfo } from "../shared/links.js";
import { isActivity, userForSession } from "../shared/sessions.js";
import { isPreviewId, type Proof } from "./registry.js";
import type { DeploymentRuntime } from "./runtime.js";
import { coderKey, newDeviceId, possibleCoderKeys, readDevice, writeDevice } from "./session.js";
import type { ResolveCoderRequest, ResolvedCoder } from "./types.js";

// A coder request, step by step (coder.ts): the deployment's runtime, the
// version the client works with, and the coder the request is from.

/** The deployment version the client's design belongs to (contracts SessionResponse.version). */
const VERSION_HEADER = "x-annotinder-version";

/** A request without a session here asks for one: counted per address (rate limit `newSessions`), 429 past it. */
async function countNewSession(server: Server, c: Context): Promise<void> {
  await server.rateLimiter?.countAddress("newSessions", c);
}

/**
 * The runtime of the request's deployment, for a request that belongs
 * there (`Deployments.admit`; one that doesn't, a guessed link or id,
 * counts as asking for a new session), as current as the database
 * (`refresh`: a suspended or deleted study answers no more).
 */
export async function loadRuntime(server: Server, c: Context, proof: Proof): Promise<DeploymentRuntime> {
  let runtime: DeploymentRuntime;
  try {
    runtime = await server.deployments.admit(c.req.param("deployment")!, proof);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 401)) await countNewSession(server, c);
    throw error;
  }
  await runtime.refresh();
  return runtime;
}

/** What a request shows to belong to a deployment, before its runtime is loaded: its link, its device and its login. */
export async function proofOf(server: Server, c: Context): Promise<Proof> {
  const device = readDevice(c);
  const deploymentId = c.req.param("deployment")!;
  return {
    linkSecret: c.req.header("x-link-secret"),
    deviceKeys: device ? await possibleCoderKeys(device, deploymentId, urlParamsOf(c)) : [],
    login: loginOf(server, c),
  };
}

/** Reads the request's login (the same as researchers', docs/coder-identity.md §5) when asked. Never in previews. */
function loginOf(server: Server, c: Context): (() => Promise<{ email: string } | null>) | undefined {
  if (isPreviewId(c.req.param("deployment")!)) return undefined;
  return loginReader(server, c);
}

/**
 * Reads the login of a coder's request, if it has a login cookie: the
 * request is activity, as a researcher's (shared/sessions.ts). Coding
 * doesn't need the login once the session is linked to its email: the
 * device's session goes on when the login ends.
 */
export function loginReader(server: Server, c: Context): (() => Promise<User | null>) | undefined {
  const cookie = getCookie(c, SESSION_COOKIE);
  if (!cookie) return undefined;
  return () => userForSession(server.db, cookie, server.loginLimits, { active: isActivity(c.req.method) });
}

/**
 * The client works with the design of the version it loaded; after a
 * deploy it must load the session again (409 `design_changed`). The session
 * and transfer links don't depend on the design.
 */
export function versionGuard(c: Context, runtime: DeploymentRuntime): void {
  const version = c.req.header(VERSION_HEADER);
  const exempt = c.req.path.endsWith("/session") || c.req.path.endsWith("/transfer");
  if (version !== undefined && version !== String(runtime.version) && !exempt) {
    throw new HttpError(409, "A new version of the study was deployed", "design_changed");
  }
}

/**
 * Whether this study's coders may sign in where they don't have to
 * (docs/coder-identity.md §5): expert coders always, a crowd where the
 * study's owner's plan has it on (`crowdSignIn`). Read when first asked, at
 * most once per request.
 */
function optionalSignIn(server: Server, runtime: DeploymentRuntime): () => Promise<boolean> {
  let allowed: Promise<boolean> | undefined;
  return () => (allowed ??= runtime.crowd ? crowdSignInAllowed(server.db, runtime.studyId) : Promise.resolve(true));
}

/** What a session says about signing in (contracts `SessionResponse`): how it stands in the study, and whether this session is offered it. */
export interface SignInOffer {
  signIn: SignIn;
  canLogIn: boolean;
}

/**
 * The coder a request is from: the device's session in this deployment
 * (docs/coder-identity.md §4), started from its link on the first request.
 * `signInOffer`: what the session says about signing in, read when asked
 * (`GET /session`). A coder id that has a session elsewhere (409
 * `coder_has_session`) is told whether signing in here is offered
 * (`canLogIn`).
 */
export async function resolveRequestCoder(
  server: Server,
  c: Context,
  runtime: DeploymentRuntime,
): Promise<ResolvedCoder & { signInOffer: () => Promise<SignInOffer> }> {
  const deploymentId = c.req.param("deployment")!;
  const linkSecret = c.req.header("x-link-secret");
  const urlParams = urlParamsOf(c);
  const link = linkSecret ? await linkInfo(server.db, linkSecret) : null;
  const ownLink = link?.studyId === runtime.studyId;
  // The device's key is the hash of the device id, the deployment and the
  // coder id the link carries (a device keeps a session per coder id).
  const existingDevice = readDevice(c);
  const device = existingDevice ?? newDeviceId();
  const key = await coderKey(device, deploymentId, coderFromUrl(runtime, urlParams));
  const signIn = optionalSignIn(server, runtime);
  // The coder chose to sign in: counts only where their study's coders may
  const useLogin = c.req.header("x-use-login") === "1" && (await signIn());
  const resolved = await resolve({
    coderKey: key,
    linkSecret,
    urlParams,
    // The coder asked for a new session (a coder id that already has one elsewhere)
    newSession: c.req.header("x-new-session") === "1",
    device: deviceDetails(c.req.header("user-agent")),
    // A login counts only where the study requires sign-in or the coder
    // chose to (`x-use-login`), and is read only when it matters: to link a
    // session to its email once, or to find the email's session on a new device.
    login: loginOf(server, c),
    useLogin,
    beforeNewSession: () => countNewSession(server, c),
    // A login that counts links a session started on this study's link to its email, once.
    linkable: ownLink,
    pickedName: pickedName(c.req.header("x-coder-name")),
  });
  // Only once the coder was accepted (a link may be invalid or used up).
  if (device !== existingDevice) writeDevice(c, device);
  return { ...resolved, signInOffer };

  /** `canLogIn`: the request has the study's link, which offers a login the session hasn't used. */
  async function signInOffer(): Promise<SignInOffer> {
    if (isPreviewId(deploymentId)) return { signIn: "none", canLogIn: false };
    if (runtime.loginRequired) return { signIn: "required", canLogIn: false };
    if (!server.login || !(await signIn())) return { signIn: "none", canLogIn: false };
    return { signIn: "optional", canLogIn: ownLink && resolved.coder.email === null };
  }

  /** Resolves the coder; "already started on another device" says whether signing in here is offered. */
  async function resolve(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    try {
      return await runtime.resolveCoder(request);
    } catch (error) {
      if (!(error instanceof HttpError) || error.code !== "coder_has_session") throw error;
      const canLogIn = !!server.login && (await signIn());
      throw new HttpError(409, error.message, error.code, undefined, { canLogIn });
    }
  }
}

/** The page's query parameters (`x-url-params`): the coder id and the design's URL parameters. */
export function urlParamsOf(c: Context): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(c.req.header("x-url-params") ?? ""));
}

/** The coder id a crowd's URL parameter carries (`coderParam`), if any. */
export function coderFromUrl(runtime: DeploymentRuntime, urlParams: Record<string, string>): string | undefined {
  const param = runtime.coderParam;
  return param ? own(urlParams, param)?.trim() || undefined : undefined;
}

/** The name a coder picked on a pick-your-name link (`x-coder-name`, URL-encoded), if any. */
function pickedName(header: string | undefined): string | undefined {
  if (!header) return undefined;
  try {
    return decodeURIComponent(header).trim().slice(0, 200) || undefined;
  } catch {
    return undefined;
  }
}
