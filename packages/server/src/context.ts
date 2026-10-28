import type { Sql } from "./db.js";
import type { Role } from "@annotinder/contracts";
import type { Deployments } from "./runtime/registry.js";
import type { Researcher } from "./researcher/auth.js";
import type { Oidc } from "./oidc.js";

/** What every endpoint gets (built in app.ts). */
export interface Server {
  db: Sql;
  /** The runtimes of deployed jobs and previews, in memory (runtime/registry.ts). */
  deployments: Deployments;
  /** Accept development auth headers (researcher/auth.ts). Never on a reachable server. */
  devAuth: boolean;
  /** Researcher login (researcher/login.ts); null when no provider is configured. */
  login: { oidc: Oidc; publicUrl: string } | null;
  /** Signs short-lived cookies and preview tokens. */
  secret: string;
  /** Emails that are admins on this server (`ANNOTINDER_ADMINS`), lowercased; admins can make more. */
  admins: readonly string[];
  /** Researcher access needs a login with a second factor (`ANNOTINDER_REQUIRE_MFA`); coding never does. */
  requireMfa: boolean;
}

/** Hono context variables, set by the auth middleware. */
export interface Env {
  Variables: {
    jobId: number;
    /** Researcher API only (researcher/auth.ts). */
    researcher: Researcher;
    jobUser?: { email: string; role: Role };
  };
}
