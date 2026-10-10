import { z } from "zod";
import { IdSchema } from "./common.js";
import { CodebookResponseSchema } from "./codebook/codebook.js";
import { VariableValueSchema } from "./variableValue.js";

/**
 * Per-unit_loop progress: the unit ids this coder has finished in that loop,
 * in the order they were coded. Which unit comes next is decided by the job
 * server (`GET /loop/:loop/next`).
 */
export const UnitsetProgressSchema = z.object({
  /** The unit_loop name. */
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
  /**
   * The coder's coder-level variables so far, including server-assigned
   * `auto` variables (experimental condition, slot, ...), so conditions in
   * the client can use them.
   */
  variables: z.record(z.string(), VariableValueSchema).default({}),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
