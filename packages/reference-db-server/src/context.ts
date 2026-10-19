import type { DatabaseSync } from "node:sqlite";
import type { Role } from "@annotinder/contracts";
import type { JobTokenIssuer } from "./jobTokens.js";

/** What every endpoint gets (built in app.ts). */
export interface Server {
  db: DatabaseSync;
  /** Issues and checks job tokens, and signs calls to job servers (jobTokens.ts). */
  tokens: JobTokenIssuer;
  /** This db server's own URL, as job servers address it. */
  publicUrl: string;
  /** The job server jobs are deployed to. null: none, so publishing doesn't notify anyone. */
  jobServer: JobServerLink | null;
}

export interface JobServerLink {
  url: string;
  /** For tests: how to reach the job server (default: global fetch). */
  fetch?: typeof fetch;
}

/** Hono context variables, set by the auth middleware. */
export interface Env {
  Variables: {
    jobId: number;
    /** Researcher API only (researcher/auth.ts). */
    jobUser?: { email: string; role: Role };
  };
}
