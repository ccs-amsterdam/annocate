import type { Db } from "./db/index.js";
import type { Role } from "@annotinder/contracts";
import type { Deployments } from "./runtime/registry.js";
import type { Researcher } from "./researcher/auth.js";
import type { Oidc } from "./oidc.js";
import type { FileStore } from "./shared/files.js";
import type { RateLimiter } from "./shared/rateLimit.js";
import type { LoginLimits } from "./shared/sessions.js";

/** What every endpoint gets (built in app.ts). */
export interface Server {
  db: Db;
  /** The runtimes of deployed studies and previews, in memory (runtime/registry.ts). */
  deployments: Deployments;
  /** Development mode (`AUTH_DEV_MODE`): development auth headers (researcher/auth.ts), on this machine only (index.ts refuses otherwise). */
  devMode: boolean;
  /**
   * Researcher login (researcher/login.ts); null when no provider is
   * configured. `previous`: the provider being moved away from
   * (`OIDC_PREVIOUS_*`), accepted until `until` (docs/accounts.md "Changing providers").
   */
  login: {
    oidc: Oidc;
    publicUrl: string;
    /** The provider's account page, where users set up a second factor (`OIDC_ACCOUNT_URL`). */
    accountUrl: string | null;
    previous: { oidc: Oidc; until: Date } | null;
  } | null;
  /** Signs short-lived cookies, preview tokens and download links. */
  secret: string;
  /** Files the server keeps, e.g. results exports (shared/files.ts; `ANNOTINDER_FILES_DIR`). */
  files: FileStore;
  /** Emails that are admins on this server (`ANNOTINDER_ADMINS`), lowercased; admins can make more. */
  admins: readonly string[];
  /** How long logins and step-ups last (`AUTH_SESSION_*`, `AUTH_STEP_UP_*`; shared/sessions.ts). */
  loginLimits: LoginLimits;
  /**
   * Weaker security (the lab's Authentication standard, "Weaker security"):
   * `disable2fa` (`AUTH_INSECURE_DISABLE_2FA`): no second factor needed,
   * step-up only checks that the login is recent; `disableEmailVerification`
   * (`AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION`): users whose provider didn't
   * confirm their address can log in. Never for sensitive data.
   */
  insecure: { disable2fa: boolean; disableEmailVerification: boolean };
  /** Counts requests against the rate limits (shared/rateLimit.ts); null: no limits (`ANNOTINDER_RATE_LIMITS=off`, tests). */
  rateLimiter: RateLimiter | null;
}

/** Hono context variables, set by the auth middleware. */
export interface Env {
  Variables: {
    /** The request's id, as in its log line (shared/requestLog.ts). */
    requestId: string;
    studyId: number;
    /** Researcher API only (researcher/auth.ts). */
    researcher: Researcher;
    studyUser?: { email: string; role: Role };
  };
}
