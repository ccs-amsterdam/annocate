import { z } from "zod";
import { IdSchema, RoleSchema } from "./common.js";

/** A "job", the sole top-level entity in the new data model (CONTRACTS.md). */
export const JobWriteSchema = z.object({
  name: z.string().min(1).max(256),
  archived: z.boolean().optional().default(false),
  /**
   * Finished sessions stay open: coders can always go back to their answers.
   * Off by default: once a session ended, the coder gets only what its end
   * screen shows, and can go back only within 15 minutes after finishing
   * (docs/coder-identity.md §9). Left out: unchanged.
   */
  keepSessionsOpen: z.boolean().optional(),
  /**
   * Deployment settings (docs/plans/design.md §4): per name, the URL end
   * items with that `redirectSetting` send coders to, e.g. a panel's return
   * link, which differs per run. May contain `$var` and `$session`
   * references, like an end item's own URL. Left out: unchanged.
   */
  redirectUrls: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(64), z.string().max(2000)).optional(),
});
export type JobWrite = z.infer<typeof JobWriteSchema>;

export const JobResponseSchema = JobWriteSchema.extend({
  id: IdSchema,
  created: z.coerce.date(),
  keepSessionsOpen: z.boolean(),
  redirectUrls: z.record(z.string(), z.string()),
  /** Set when a server admin suspended the job: no coding and no changes (reading and deleting data still work). */
  suspendedAt: z.coerce.date().nullable().optional(),
  /** The example the job was made from (`ExampleSummary.id`), if any. */
  origin: z.string().nullable().optional(),
});
export type JobResponse = z.infer<typeof JobResponseSchema>;

/**
 * An example job AnnoTinder ships (`GET /examples`): a codebook with units,
 * a link and sometimes example answers, to try and adapt
 * (docs/plans/examples.md).
 */
export const ExampleSummarySchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  /** What it shows. */
  description: z.string(),
  /** What to try with the job made from it. */
  tryThis: z.array(z.string()),
});
export type ExampleSummary = z.infer<typeof ExampleSummarySchema>;

/** Body of `POST /job/from-example`: which example, and the new job's name (default: the example's). */
export const JobFromExampleSchema = z.object({
  example: z.string().min(1),
  name: z.string().min(1).max(256).optional(),
});
export type JobFromExample = z.infer<typeof JobFromExampleSchema>;

/**
 * A "job user" manages the job (create/edit design versions, units, link
 * coders, ...). Distinct from a "coder", who annotates via a link/access
 * link (see coder.ts). Whole-resource replace via `PUT /job/:id/users`.
 */
export const JobUserSchema = z.object({
  email: z.string().email(),
  role: RoleSchema,
});
export type JobUser = z.infer<typeof JobUserSchema>;

export const JobUsersWriteSchema = z.object({
  users: z.array(JobUserSchema),
});
