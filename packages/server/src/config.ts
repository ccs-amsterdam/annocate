import type { ServerOperatorInfo } from "@annotinder/contracts";
import type { AppOptions } from "./app.js";
import { parseMfaClaim, type OidcOptions } from "./oidc.js";
import { TRUST_PROXY, TRUST_PROXY_SOURCE, type TrustProxy } from "./shared/clientAddress.js";
import type { RateLimits } from "./shared/rateLimit.js";

// The server's settings, from environment variables (docs/hosting.md
// "Settings" has the full list). An empty value counts as unset.
//
// PORT (default 8787); HOST (where to listen; default all addresses, in
// development mode localhost only); DATABASE_URL (Postgres), or else
// PGLITE_DIR (a local PGlite database, default .pglite in this package: both
// read in database.ts); ANNOTINDER_SECRET (signs login state and preview
// tokens; random per process if not set: required with DATABASE_URL); ANNOTINDER_CLIENT_DIR (the built
// client, served from this server); ANNOTINDER_DEMO=1 (an empty database
// gets the demo study: development).
//
// Researcher login, as in the lab's Authentication standard (docs/security.md):
// OIDC_HOST (the provider's issuer), OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
// OIDC_MFA_CLAIM (amr:mfa, default, or acr:<value>), OIDC_ACCOUNT_URL (the
// provider's account page, where users set up a second factor: required
// unless AUTH_INSECURE_DISABLE_2FA), AUTH_STEP_UP_MAX_AGE
// (seconds, default 600), and during a move to another provider
// OIDC_PREVIOUS_HOST, OIDC_PREVIOUS_CLIENT_ID, OIDC_PREVIOUS_CLIENT_SECRET,
// OIDC_PREVIOUS_MFA_CLAIM, OIDC_PREVIOUS_UNTIL; AUTH_DEV_MODE=1 (development
// headers instead of a login: refused unless the server listens on localhost
// only); AUTH_INSECURE_DISABLE_2FA=true, AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION=true
// (weaker security: teaching and other servers without sensitive data);
// ANNOTINDER_PUBLIC_URL (where browsers reach the server);
// ANNOTINDER_ADMINS (comma-separated emails: the server's first admins);
// ANNOTINDER_FRAME_ANCESTORS (origins that may frame AnnoTinder, e.g. AmCAT's);
// ANNOTINDER_TRUST_PROXY=proxy or cloudflare (what is in front: where client addresses come from);
// ANNOTINDER_RATE_LIMITS=off (no rate limits; docs/security.md); ANNOTINDER_NEW_SESSIONS_PER_ADDRESS
// (new coder sessions per address per 10 minutes: default 500, or off); ANNOTINDER_FILES_DIR
// (where exports are kept; default a temp folder: they are a cache).
//
// The "About this server" page (all optional): ANNOTINDER_OPERATOR (who runs
// the server), ANNOTINDER_HOSTING (where it is hosted), ANNOTINDER_CONTACT
// (an email address or other text), ANNOTINDER_PRIVACY_URL and
// ANNOTINDER_TERMS_URL (web addresses).

/** Environment variables, as `process.env` has them. */
export type Environment = Record<string, string | undefined>;

type Login = NonNullable<AppOptions["login"]>;

/** The server's settings, checked. */
export interface Config {
  port: number;
  /** Where to listen; undefined: all addresses. */
  host: string | undefined;
  /** `ANNOTINDER_DEMO`: an empty database gets the demo study. */
  demo: boolean;
  /** `ANNOTINDER_FILES_DIR`; undefined: a folder in the temp folder. */
  filesDir: string | undefined;
  devMode: boolean;
  secret: string | undefined;
  login: Login | undefined;
  admins: string[];
  stepUpMaxAge: number;
  insecure: { disable2fa: boolean; disableEmailVerification: boolean };
  clientDir: string | undefined;
  frameAncestors: string[];
  https: boolean;
  /** Undefined: no rate limits. */
  rateLimits: Partial<RateLimits> | undefined;
  trustProxy: TrustProxy;
  /** What the "About this server" page says (null: not set). */
  info: ServerOperatorInfo;
}

/** Development mode only on this machine: never on a server other people reach. */
const LOOPBACK = ["localhost", "127.0.0.1", "::1"];

/** Reads and checks the settings; throws an Error that says what to change. */
export function readConfig(env: Environment): Config {
  const port = Number(env.PORT ?? 8787);
  const devMode = env.AUTH_DEV_MODE === "1";
  const host = env.HOST?.trim() || (devMode ? "localhost" : undefined);
  if (devMode && !LOOPBACK.includes(host ?? "")) {
    throw new Error(
      `AUTH_DEV_MODE needs the server to listen on localhost only (HOST=${host ?? "all addresses"}): development mode is never for a server other people use`,
    );
  }
  checkProduction(env, devMode);
  const insecure = {
    disable2fa: insecureFlag(env, "AUTH_INSECURE_DISABLE_2FA"),
    disableEmailVerification: insecureFlag(env, "AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION"),
  };
  return {
    port,
    host,
    demo: env.ANNOTINDER_DEMO === "1",
    filesDir: env.ANNOTINDER_FILES_DIR || undefined,
    devMode,
    // An empty value counts as unset (a random secret), never as an empty signing key
    secret: env.ANNOTINDER_SECRET || undefined,
    login: readLogin(env, port, insecure),
    admins: (env.ANNOTINDER_ADMINS ?? "").split(","),
    stepUpMaxAge: readStepUpMaxAge(env),
    insecure,
    clientDir: env.ANNOTINDER_CLIENT_DIR || undefined,
    frameAncestors: (env.ANNOTINDER_FRAME_ANCESTORS ?? "").split(/[\s,]+/).filter(Boolean),
    https: env.ANNOTINDER_PUBLIC_URL?.startsWith("https://") ?? false,
    rateLimits: readRateLimits(env),
    trustProxy: readTrustProxy(env),
    info: readInfo(env),
  };
}

/** A signing key shorter than this can be guessed (`openssl rand -hex 32` gives 64 characters). */
const SECRET_MIN_LENGTH = 32;

/**
 * A server on Postgres outside development mode is one other people use: it
 * doesn't start on settings that only fit development. Without a secret,
 * logins, preview links and download links end at every restart and differ
 * per process; without its public address, login redirects go to localhost.
 */
function checkProduction(env: Environment, devMode: boolean): void {
  const secret = env.ANNOTINDER_SECRET;
  if (secret && secret.length < SECRET_MIN_LENGTH)
    throw new Error(
      `ANNOTINDER_SECRET must be at least ${SECRET_MIN_LENGTH} characters (it has ${secret.length}): make one with openssl rand -hex 32`,
    );
  if (!env.DATABASE_URL || devMode) return;
  if (!secret)
    throw new Error(
      "ANNOTINDER_SECRET is required with DATABASE_URL: it signs logins, preview links and download links (openssl rand -hex 32)",
    );
  const publicUrl = env.ANNOTINDER_PUBLIC_URL;
  if (!publicUrl)
    throw new Error(
      "ANNOTINDER_PUBLIC_URL is required with DATABASE_URL: where browsers reach this server, e.g. https://annotinder.example.org",
    );
  if (!/^https?:\/\/[^/]+$/.test(publicUrl))
    throw new Error(`ANNOTINDER_PUBLIC_URL must be a web address without a path or trailing slash, not "${publicUrl}"`);
}

/** Weaker security (the lab's Authentication standard): never for sensitive data, so said at every start. */
function insecureFlag(env: Environment, name: string): boolean {
  const value = env[name]?.trim().toLowerCase();
  if (!value || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be true or false, not "${env[name]}"`);
}

function readStepUpMaxAge(env: Environment): number {
  const stepUpMaxAge = Number(env.AUTH_STEP_UP_MAX_AGE ?? 600);
  if (!Number.isInteger(stepUpMaxAge) || stepUpMaxAge <= 0)
    throw new Error("AUTH_STEP_UP_MAX_AGE must be a number of seconds");
  return stepUpMaxAge;
}

/** The login provider, if one is configured. */
function readLogin(env: Environment, port: number, insecure: Config["insecure"]): Login | undefined {
  const { OIDC_HOST, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = env;
  const previous = readPreviousProvider(env);
  if (!OIDC_HOST || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) return undefined;
  const accountUrl = env.OIDC_ACCOUNT_URL?.trim() || undefined;
  // With 2FA required, users must be able to set it up themselves: the provider's account page
  if (!insecure.disable2fa) {
    if (!accountUrl)
      throw new Error(
        "OIDC_ACCOUNT_URL is required: the login provider's account page, where users set up a second factor (for Keycloak <OIDC_HOST>/account). Or set AUTH_INSECURE_DISABLE_2FA=true (docs/security.md).",
      );
    if (!/^https?:\/\//.test(accountUrl))
      throw new Error(`OIDC_ACCOUNT_URL must be a web address, not "${accountUrl}"`);
  }
  return {
    oidc: {
      issuer: OIDC_HOST,
      clientId: OIDC_CLIENT_ID,
      clientSecret: OIDC_CLIENT_SECRET,
      mfaClaim: parseMfaClaim(env.OIDC_MFA_CLAIM),
    },
    publicUrl: env.ANNOTINDER_PUBLIC_URL || `http://localhost:${port}`,
    ...(accountUrl ? { accountUrl } : {}),
    ...(previous ? { previous } : {}),
  };
}

/** Moving to another provider: the previous one, accepted until OIDC_PREVIOUS_UNTIL (docs/accounts.md "Changing providers"). */
function readPreviousProvider(env: Environment): { oidc: OidcOptions; until: Date } | undefined {
  const { OIDC_PREVIOUS_HOST, OIDC_PREVIOUS_CLIENT_ID, OIDC_PREVIOUS_CLIENT_SECRET, OIDC_PREVIOUS_UNTIL } = env;
  if (!OIDC_PREVIOUS_HOST) return undefined;
  const until = new Date(OIDC_PREVIOUS_UNTIL ?? "");
  if (!OIDC_PREVIOUS_CLIENT_ID || !OIDC_PREVIOUS_CLIENT_SECRET || Number.isNaN(until.getTime())) {
    throw new Error(
      "OIDC_PREVIOUS_HOST needs OIDC_PREVIOUS_CLIENT_ID, OIDC_PREVIOUS_CLIENT_SECRET and OIDC_PREVIOUS_UNTIL (a date)",
    );
  }
  return {
    oidc: {
      issuer: OIDC_PREVIOUS_HOST,
      clientId: OIDC_PREVIOUS_CLIENT_ID,
      clientSecret: OIDC_PREVIOUS_CLIENT_SECRET,
      mfaClaim: parseMfaClaim(env.OIDC_PREVIOUS_MFA_CLAIM),
    },
    until,
  };
}

/** Rate limits: on unless ANNOTINDER_RATE_LIMITS=off (e.g. a load test from one machine). */
function readRateLimits(env: Environment): Partial<RateLimits> | undefined {
  const newSessions = env.ANNOTINDER_NEW_SESSIONS_PER_ADDRESS?.trim() || "500";
  if (newSessions !== "off" && !/^[1-9][0-9]*$/.test(newSessions))
    throw new Error(`ANNOTINDER_NEW_SESSIONS_PER_ADDRESS must be a number or off, not "${newSessions}"`);
  if (env.ANNOTINDER_RATE_LIMITS === "off") return undefined;
  return { newSessions: newSessions === "off" ? Infinity : Number(newSessions) };
}

function readTrustProxy(env: Environment): TrustProxy {
  const trustProxy = (env.ANNOTINDER_TRUST_PROXY?.trim() || "none") as TrustProxy;
  if (!TRUST_PROXY.includes(trustProxy))
    throw new Error(`ANNOTINDER_TRUST_PROXY must be ${TRUST_PROXY.join(", ")}, not "${trustProxy}" (docs/hosting.md)`);
  return trustProxy;
}

/** What the operator says about the server, for its "About this server" page. */
function readInfo(env: Environment): ServerOperatorInfo {
  const text = (name: string) => env[name]?.trim() || null;
  const url = (name: string) => {
    const value = text(name);
    if (value && !/^https?:\/\//.test(value)) throw new Error(`${name} must be a web address, not "${value}"`);
    return value;
  };
  return {
    operator: text("ANNOTINDER_OPERATOR"),
    hosting: text("ANNOTINDER_HOSTING"),
    contact: text("ANNOTINDER_CONTACT"),
    privacyUrl: url("ANNOTINDER_PRIVACY_URL"),
    termsUrl: url("ANNOTINDER_TERMS_URL"),
  };
}

/** What the server says of its settings when it starts: `lines`, and `warnings` for what weakens it. */
export function describeConfig(config: Config): { lines: string[]; warnings: string[] } {
  const { login, insecure } = config;
  const mfaClaim = login?.oidc.mfaClaim;
  const admins = config.admins.filter((admin) => admin.trim());
  const lines = [
    login
      ? `researcher login: ${login.oidc.issuer} (second factor: ${insecure.disable2fa || !mfaClaim ? "not required" : `${mfaClaim.claim}:${mfaClaim.value}`}), callback ${login.publicUrl}/api/auth/callback`
      : "researcher login: not configured (OIDC_HOST)",
    `admins: ${admins.join(", ") || "none named (ANNOTINDER_ADMINS)"}`,
    config.clientDir
      ? `client: ${config.clientDir}`
      : "client: not served here (ANNOTINDER_CLIENT_DIR; in development Vite serves it)",
    `client addresses (rate limits): ${config.rateLimits ? TRUST_PROXY_SOURCE[config.trustProxy] : "not used (ANNOTINDER_RATE_LIMITS=off)"}`,
  ];
  if (config.devMode)
    lines.push(
      `development mode (AUTH_DEV_MODE=1): development auth headers accepted, listening on ${config.host} only`,
    );
  const warnings: string[] = [];
  if (insecure.disable2fa)
    warnings.push(
      "AUTH_INSECURE_DISABLE_2FA: sensitive actions don't need a second factor. Not for sensitive research data.",
    );
  if (insecure.disableEmailVerification)
    warnings.push(
      "AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION: unverified email addresses can log in and claim invitations. Not for sensitive research data.",
    );
  if (login && !config.secret)
    warnings.push("ANNOTINDER_SECRET is not set: logins in progress and previews end with a restart");
  return { lines, warnings };
}
