import type { JobUserAuth, CoderRow } from "./auth.js";

/** Shared Hono context variable types, set by the auth middleware in auth.ts. */
export interface HonoEnv {
  Variables: {
    jobId: number;
    jobUser?: JobUserAuth;
    coder?: CoderRow;
  };
}
