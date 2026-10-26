import type { DatabaseSync } from "node:sqlite";
import type { Role } from "@annotinder/contracts";
import type { Deployments } from "./runtime/registry.js";

/** What every endpoint gets (built in app.ts). */
export interface Server {
  db: DatabaseSync;
  /** The runtimes of deployed jobs and previews, in memory (runtime/registry.ts). */
  deployments: Deployments;
}

/** Hono context variables, set by the auth middleware. */
export interface Env {
  Variables: {
    jobId: number;
    /** Researcher API only (researcher/auth.ts). */
    jobUser?: { email: string; role: Role };
  };
}
