import { z } from "zod";
import { IdSchema, RoleSchema, SafeNameSchema } from "./common.js";

/** The reopen time of new studies (`reopenMinutes`): a day. */
export const DEFAULT_REOPEN_MINUTES = 24 * 60;
/** The longest reopen time short of "always": a year. */
export const MAX_REOPEN_MINUTES = 365 * 24 * 60;

/** A study: the top-level entity, owning its designs, units, coders and answers (CONTRACTS.md). */
export const StudyWriteSchema = z.object({
  name: z.string().min(1).max(256),
  /** Left out: a new study isn't archived; `PUT` keeps what it was. */
  archived: z.boolean().optional(),
  /**
   * How long coders can go back after finishing, in minutes (counted from
   * when they last finished). null: always, the session stays open (coders
   * who get new units later pick them up). Once the time is up, the coder
   * gets only what the end screen shows (docs/coder-identity.md §9). New
   * studies: a day. Left out: unchanged.
   */
  reopenMinutes: z.number().int().min(0).max(MAX_REOPEN_MINUTES).nullable().optional(),
  /**
   * Deployment settings (docs/architecture.md §5): per name, the URL end
   * items with that `redirectSetting` send coders to, e.g. a panel's return
   * link, which differs per run. May contain `$var` and `$session`
   * references, like an end item's own URL. Left out: unchanged.
   */
  redirectUrls: z
    .record(
      SafeNameSchema,
      z
        .string()
        .max(2000)
        .regex(/^https?:\/\//, "A redirect URL starts with https:// (or http://)"),
    )
    .optional(),
});
export type StudyWrite = z.infer<typeof StudyWriteSchema>;

export const StudyResponseSchema = StudyWriteSchema.extend({
  archived: z.boolean(),
  id: IdSchema,
  created: z.coerce.date(),
  reopenMinutes: z.number().int().nullable(),
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
 * (docs/examples.md).
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
