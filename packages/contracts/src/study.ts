import { z } from "zod";
import { IdSchema, RoleSchema } from "./common.js";

/** Whether coders sign in: for the whole study. */
export const SignInSchema = z.enum(["off", "optional", "required"]);
export type SignIn = z.infer<typeof SignInSchema>;

/** A "study", the sole top-level entity in the new data model (CONTRACTS.md). */
export const StudyWriteSchema = z.object({
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
   * Whether coders sign in (docs/plans/unit-assignment.md §4), for the whole
   * study: `required` (before they start), `optional` (offered, to continue
   * on other devices) or `off`. Coders by email address always sign in.
   * Left out: unchanged (`off` for a new study).
   */
  signIn: SignInSchema.optional(),
  /**
   * Deployment settings (docs/plans/design.md §4): per name, the URL end
   * items with that `redirectSetting` send coders to, e.g. a panel's return
   * link, which differs per run. May contain `$var` and `$session`
   * references, like an end item's own URL. Left out: unchanged.
   */
  redirectUrls: z
    .record(
      z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
        .max(64),
      z.string().max(2000),
    )
    .optional(),
});
export type StudyWrite = z.infer<typeof StudyWriteSchema>;

export const StudyResponseSchema = StudyWriteSchema.extend({
  id: IdSchema,
  created: z.coerce.date(),
  keepSessionsOpen: z.boolean(),
  signIn: SignInSchema,
  redirectUrls: z.record(z.string(), z.string()),
  /** Set when a server admin suspended the study: no coding and no changes (reading and deleting data still work). */
  suspendedAt: z.coerce.date().nullable().optional(),
  /** The example the study was made from (`ExampleSummary.id`), if any. */
  origin: z.string().nullable().optional(),
});
export type StudyResponse = z.infer<typeof StudyResponseSchema>;

/**
 * An example study AnnoTinder ships (`GET /examples`): a design with units,
 * a link and sometimes example answers, to try and adapt
 * (docs/plans/examples.md).
 */
export const ExampleSummarySchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  /** What it shows. */
  description: z.string(),
  /** What to try with the study made from it. */
  tryThis: z.array(z.string()),
});
export type ExampleSummary = z.infer<typeof ExampleSummarySchema>;

/** Body of `POST /study/from-example`: which example, and the new study's name (default: the example's). */
export const StudyFromExampleSchema = z.object({
  example: z.string().min(1),
  name: z.string().min(1).max(256).optional(),
});
export type StudyFromExample = z.infer<typeof StudyFromExampleSchema>;

/**
 * A "study user" manages the study (create/edit design versions, units, link
 * coders, ...). Distinct from a "coder", who annotates via a link/access
 * link (see coder.ts). Whole-resource replace via `PUT /study/:id/users`.
 */
export const StudyUserSchema = z.object({
  email: z.string().email(),
  role: RoleSchema,
  /** Writing: turn this user's role on again after the safeguards turned it off (`disabled`); its date counts from now. */
  restore: z.literal(true).optional(),
});
export type StudyUser = z.infer<typeof StudyUserSchema>;

/**
 * A study user as listed: `pending`: invited by email, not logged in yet
 * (their first login claims the role, within 3 months); `disabled`: the
 * safeguards turned the role off (an expired invitation, or a dormant user):
 * save it with `restore` to turn it on again.
 */
export const StudyUserResponseSchema = StudyUserSchema.omit({ restore: true }).extend({
  pending: z.boolean(),
  disabled: z.boolean(),
});
export type StudyUserResponse = z.infer<typeof StudyUserResponseSchema>;

export const StudyUsersWriteSchema = z.object({
  users: z.array(StudyUserSchema),
});
