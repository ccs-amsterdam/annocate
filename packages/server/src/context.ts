import type { Sql } from "./db.js";
import type { Role } from "@annotinder/contracts";
import type { Deployments } from "./runtime/registry.js";
import type { Researcher } from "./researcher/auth.js";
import type { Oidc } from "./oidc.js";

/** What every endpoint gets (built in app.ts). */
export interface Server {
  db: Sql;
  /** The runtimes of deployed studies and previews, in memory (runtime/registry.ts). */
  deployments: Deployments;
  /** Development mode (`AUTH_DEV_MODE`): development auth headers (researcher/auth.ts), on this machine only (index.ts refuses otherwise). */
  devMode: boolean;
  /** Researcher login (researcher/login.ts); null when no provider is configured. */
  login: { oidc: Oidc; publicUrl: string } | null;
  /** Signs short-lived cookies and preview tokens. */
  secret: string;
  /** Emails that are admins on this server (`ANNOTINDER_ADMINS`), lowercased; admins can make more. */
  admins: readonly string[];
  /** How recent (seconds) a login's second factor must be for sensitive actions (`AUTH_STEP_UP_MAX_AGE`, default 600). */
  stepUpMaxAge: number;
}

/** Hono context variables, set by the auth middleware. */
export interface Env {
  Variables: {
    studyId: number;
    /** Researcher API only (researcher/auth.ts). */
    researcher: Researcher;
    studyUser?: { email: string; role: Role };
  };
}
