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
  /**
   * How many units this coder will get in the loop, if known: fixed sources
   * (capped by `maxUnits`). Null when it depends on other coders (dynamic
   * sources without `maxUnits`) or the coder isn't routed yet.
   */
  totalUnits: z.number().int().nonnegative().nullable().optional(),
});

/** Response for `GET /session`. */
export const SessionResponseSchema = z.object({
  coderId: IdSchema,
  jobId: IdSchema,
  /** The codebook this session was started with (immutable for the lifetime of the session, see CONTRACTS.md). */
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

/**
 * Machine-readable `code` in error responses (`{ error, code }`) that the
 * client handles specially (docs/coder-identity.md).
 */
export const CoderErrorCodeSchema = z.enum([
  /** Participant id already has a session; retry with `x-new-session: 1` to start another. */
  "participant_has_session",
  /** The invite requires login. */
  "auth_required",
  /** Transfer token unknown, used or expired. */
  "transfer_invalid",
  /** The job server can't store more answers until the db server is reachable again. */
  "storage_unavailable",
  /** `GET /loop/:loop/next` needs the client's branch choice (`branch` + `unitsets`), see NextUnitQuerySchema. */
  "branch_required",
]);
export type CoderErrorCode = z.infer<typeof CoderErrorCodeSchema>;

/** Response for `POST /transfer`: a one-time token to continue this session on another device. */
export const TransferResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.coerce.date(),
});
export type TransferResponse = z.infer<typeof TransferResponseSchema>;

/** Body for `POST /transfer/redeem` (no coder auth needed). */
export const RedeemTransferSchema = z.object({ token: z.string().min(1) });

/** Response for `POST /transfer/redeem`: empty; the job server sets the session cookie on the new device. */
export const RedeemTransferResponseSchema = z.object({});
