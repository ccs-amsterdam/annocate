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
  /** The unit loop's key: its position in the codebook (`unitLoops`). */
  unitset: z.string(),
  doneUnitIds: z.array(IdSchema),
  /**
   * How many units this coder will get in the loop, if known: the size of
   * their set plus the overlap, or in `shared` mode `maxUnits` plus the
   * overlap. Null when it depends on other coders (`shared` without
   * `maxUnits`) or the coder isn't routed yet.
   */
  totalUnits: z.number().int().nonnegative().nullable().optional(),
});

/** How a session ended: the `end` item the coder reached, and its outcome. */
export const SessionEndSchema = z.object({
  item: z.string(),
  outcome: z.enum(["screenout", "complete"]),
  at: z.coerce.date(),
});
export type SessionEnd = z.infer<typeof SessionEndSchema>;

/** Body for `POST /end`: the `end` item the coder reached. */
export const EndSessionSchema = z.object({ item: z.string().min(1) });
export type EndSession = z.infer<typeof EndSessionSchema>;

/** Response for `GET /session`. */
export const SessionResponseSchema = z.object({
  coderId: IdSchema,
  jobId: IdSchema,
  /** The published codebook coders get now. */
  codebook: CodebookResponseSchema,
  /**
   * The deployment's version: bumped on every publish. The client sends it
   * back as `x-annotinder-version`; after a publish the server answers
   * 409 `codebook_changed`, and the client loads the session again
   * (docs/api/coder.md).
   */
  version: z.number().int().positive(),
  progress: z.array(UnitsetProgressSchema),
  /**
   * The coder's coder-level variables so far, including server-assigned
   * `auto` variables (experimental condition, slot, ...), so conditions in
   * the client can use them.
   */
  variables: z.record(z.string(), VariableValueSchema).default({}),
  /** Set once the coder reached an `end` item (`POST /end`): the session is over. */
  ended: SessionEndSchema.nullable().optional(),
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
  /** A new codebook version was published since the session was loaded: load it again. */
  "codebook_changed",
  /** `GET /loop/:loop/next` needs the client's branch choice (`branch` + `unitsets`), see NextUnitQuerySchema. */
  "branch_required",
  /** The coder reached an `end` item: no more units or answers. */
  "session_ended",
  /** Preview only: the latest codebook has issues, so it can't run. */
  "codebook_invalid",
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

/** Response for `POST /transfer/redeem`: empty; the server sets the session cookie on the new device. */
export const RedeemTransferResponseSchema = z.object({});
