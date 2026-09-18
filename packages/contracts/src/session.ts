import { z } from "zod";
import { IdSchema } from "./common";
import { CodebookResponseSchema } from "./codebook/codebook";

/**
 * Per-unitset progress: the list of unit ids this coder has already done, in
 * the order they were coded (design plan §3a, MVP option A). The client
 * derives "next unit" and "go back to unit N" from this list itself.
 *
 * NOTE: intentionally does not scale to very large unit counts or support
 * crowd-coding's server-side global assignment queue -- see design plan §3a
 * for the deferred follow-up design work.
 */
export const UnitsetProgressSchema = z.object({
  unitset: z.string(),
  doneUnitIds: z.array(IdSchema),
});

/** Response for `GET /session`. */
export const SessionResponseSchema = z.object({
  coderId: IdSchema,
  jobId: IdSchema,
  /** The codebook this session was started with (immutable for the lifetime of the session, see design plan §2). */
  codebook: CodebookResponseSchema,
  progress: z.array(UnitsetProgressSchema),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
