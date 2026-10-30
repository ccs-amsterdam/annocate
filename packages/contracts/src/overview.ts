import { z } from "zod";

/**
 * Researcher-facing `GET /job/:jobId/overview`: counts for the job's overview
 * page. Answers are unit-level variable values that are live (not retired).
 */
export const JobOverviewSchema = z.object({
  units: z.number().int().nonnegative(),
  /** The set groups, with their sets' sizes. */
  groups: z.array(z.object({ name: z.string(), sets: z.array(z.object({ name: z.string(), units: z.number().int().nonnegative() })) })),
  coders: z.object({
    total: z.number().int().nonnegative(),
    /** Coders who gave at least one answer. */
    started: z.number().int().nonnegative(),
    /** Coders who answered something in the last 24 hours. */
    activeLastDay: z.number().int().nonnegative(),
  }),
  answers: z.number().int().nonnegative(),
  /**
   * (unit, coder) pairs that finished a loop of the live codebook: every
   * question of the loop answered (the rule of the backend `finished` endpoint).
   * Zero if nothing is published.
   */
  codings: z.number().int().nonnegative(),
  lastActivity: z.coerce.date().nullable(),
  /** Per day (UTC, `YYYY-MM-DD`), the last 30 days, oldest first; days without answers included. */
  activity: z.array(
    z.object({
      day: z.string(),
      answers: z.number().int().nonnegative(),
      /** Coders who answered something that day. */
      coders: z.number().int().nonnegative(),
    }),
  ),
});
export type JobOverview = z.infer<typeof JobOverviewSchema>;
