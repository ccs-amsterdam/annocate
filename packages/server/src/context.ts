import type { Sql } from "./db.js";
import type { Role } from "@annotinder/contracts";
import type { Deployments } from "./runtime/registry.js";
import type { Researcher } from "./researcher/auth.js";

/** What every endpoint gets (built in app.ts). */
export interface Server {
  db: Sql;
  /** The runtimes of deployed jobs and previews, in memory (runtime/registry.ts). */
  deployments: Deployments;
  /** Accept development auth headers (researcher/auth.ts). Never on a reachable server. */
  devAuth: boolean;
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
