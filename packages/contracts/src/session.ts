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

/** The unit an `end` item inside a unit loop was reached on: the loop's key and the unit id. */
export const EndUnitSchema = z.object({ loop: z.string().min(1), id: IdSchema });
export type EndUnit = z.infer<typeof EndUnitSchema>;

/**
 * How a session ended: at an `end` item (its name and outcome, screened out
 * or complete), or because the coder quit (`quit`, no item). `unit`: an end
 * inside a unit loop was reached on this unit, so the ending can be shown
 * again with the unit's values (its message may use them).
 */
export const SessionEndSchema = z.object({
  item: z.string().optional(),
  unit: EndUnitSchema.optional(),
  outcome: z.enum(["screenout", "complete", "quit"]),
  at: z.coerce.date(),
});
export type SessionEnd = z.infer<typeof SessionEndSchema>;

/**
 * A coder's request to delete their answers (`POST /quit` with
 * `requestDeletion`). The researcher deletes the coder's data now, or
 * later (the request is then no longer brought up, but stays). Not deleted automatically: the
 * researcher may already hold the data elsewhere, and a request could
 * otherwise undo paid panel work at once.
 */
export const DeletionRequestSchema = z.object({
  at: z.coerce.date(),
  /** Set when the researcher chose to delete later: the request stays, but is no longer brought up. */
  postponedAt: z.coerce.date().nullable().optional(),
});
export type DeletionRequest = z.infer<typeof DeletionRequestSchema>;

/** Body for `POST /quit`: the coder stops for good, optionally asking for their answers to be deleted. */
export const QuitSessionSchema = z.object({ requestDeletion: z.boolean().default(false) });
export type QuitSession = z.infer<typeof QuitSessionSchema>;

/** Body for `POST /end`: the `end` item the coder reached; without one, they finished the job. */
export const EndSessionSchema = z.object({ item: z.string().min(1).optional(), unit: EndUnitSchema.optional() });

/**
 * Whether the coder can go back after the session ended (`POST /reopen`):
 * null: not (screened out, quit, or the 15 minutes after finishing are
 * over); `until` null: always (the job keeps sessions open).
 */
export const ReopenSchema = z.object({ until: z.coerce.date().nullable() }).nullable();
export type Reopen = z.infer<typeof ReopenSchema>;

/** Response of `POST /end`. */
export const EndSessionResponseSchema = z.object({ reopen: ReopenSchema });
export type EndSessionResponse = z.infer<typeof EndSessionResponseSchema>;

/**
 * What an ended session's end screen shows, after a reload: the values its
 * message and redirect link use (`$var`, and with an end inside a unit loop
 * the unit's `$unit` fields and answers). A session that ended gets no more
 * than this, unless its job keeps sessions open.
 */
export const EndValuesSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
  unit: z.object({ data: z.record(z.string(), z.unknown()), variables: z.record(z.string(), VariableValueSchema) }).nullable(),
});
export type EndValues = z.infer<typeof EndValuesSchema>;
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
  /**
   * Coder-level answers that can't be changed any more: units were coded
   * with them (`loopDependencies`). The server ignores new values for them.
   */
  frozen: z.array(z.string()).default([]),
  /** Set once the coder reached an `end` item (`POST /end`) or quit (`POST /quit`): the session is over. */
  ended: SessionEndSchema.nullable().optional(),
  /** Set once the coder asked for their answers to be deleted. */
  deletionRequest: DeletionRequestSchema.nullable().optional(),
  /** `$session` values: the link and URL parameters, `participant`, `source` and `email` when the session has them. */
  session: z.record(z.string(), z.string()).default({}),
  /** The email of the login this session belongs to (docs/coder-identity.md §5); null without. Logged-in coders continue on any device by logging in there. */
  login: z.string().nullable().optional(),
  /** The invitation lets the coder log in (`auth: "optional"`), and they haven't: offer it, to continue on other devices. */
  canLogIn: z.boolean().optional(),
  /** With `ended`: what its end screen shows. */
  endValues: EndValuesSchema.nullable().optional(),
  /** With `ended`: whether the coder can go back. */
  reopen: ReopenSchema.optional(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * Machine-readable `code` in error responses (`{ error, code }`) that the
 * client handles specially (docs/coder-identity.md).
 */
export const CoderErrorCodeSchema = z.enum([
  /** Participant id already has a session; retry with `x-new-session: 1` to start another. */
  "participant_has_session",
  /** The invite requires login (also: it lists email addresses). */
  "auth_required",
  /**
   * The coder's login isn't one of the link's email addresses, or (sets by
   * email) not one of the group's sets: "This email address has no access to this study".
   */
  "email_not_invited",
  /** The link is no longer part of the published design (e.g. its set was removed): no new sessions. */
  "link_inactive",
  /** Transfer token unknown, used or expired. */
  "transfer_invalid",
  /** A new codebook version was published since the session was loaded: load it again. */
  "codebook_changed",
  /** `GET /loop/:loop/next` needs the client's branch choice (`branch`), see NextUnitQuerySchema. */
  "branch_required",
  /** The coder reached an `end` item or quit: no more units or answers. */
  "session_ended",
  /** The session ended and its job closes finished sessions: its answers can't be looked at again. */
  "session_closed",
  /** Preview only: the latest codebook has issues, so it can't run. */
  "codebook_invalid",
  /** The codebook requires a URL parameter the link doesn't have. */
  "url_param_missing",
  /** A URL parameter's value isn't one the codebook accepts (its values, pattern or length). */
  "url_param_invalid",
  /** The researchers paused the job: no new sessions or units until they resume it (what is open can be saved). */
  "job_paused",
  /** An admin suspended the job (docs/accounts.md). */
  "job_suspended",
  /** The job reached its owner's limit on coders or answers. */
  "job_full",
  /** An answer is larger than the server allows. */
  "answer_too_large",
  /** The request body is larger than the server allows. */
  "request_too_large",
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
