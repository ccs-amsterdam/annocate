import { z } from "zod";
import { IdSchema } from "./common.js";
import { CoderCodebookSchema } from "./design/coderCodebook.js";
import { VariableValueSchema } from "./variableValue.js";

/**
 * Per-unit_loop progress: the unit ids this coder has finished in that loop,
 * in the order they were coded. Which unit comes next is decided by the study
 * server (`GET /loop/:loop/next`).
 */
export const SetProgressSchema = z.object({
  /** The unit loop's id (`unitLoops`). */
  set: z.string(),
  doneUnitIds: z.array(IdSchema),
  /**
   * How many units this coder will get in the loop, if known: the size of
   * their set plus the overlap, or in a shared queue `unitsPerCoder.max`
   * plus the overlap. Null when it depends on other coders (a shared queue
   * without `unitsPerCoder.max`) or the coder isn't routed yet.
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

/**
 * How a coder's screen looked (docs/client.md §4 "Display"), sent by the
 * coding screen when it starts and when it changes: their keys for answers;
 * in responsive studies the width class; where the study lets them choose,
 * their theme. Recorded with a timestamp on the session.
 */
export const DisplayEntrySchema = z.object({
  keys: z.string().min(1).max(20),
  width: z.enum(["narrow", "wide"]).optional(),
  theme: z.enum(["light", "dark"]).optional(),
});
export type DisplayEntry = z.infer<typeof DisplayEntrySchema>;
/** A recorded change of display: the entry and when (ISO time). */
export const DisplayChangeSchema = DisplayEntrySchema.extend({ at: z.string() });
export type DisplayChange = z.infer<typeof DisplayChangeSchema>;
/** At most this many changes are recorded per session (resizing can't flood it). */
export const MAX_DISPLAY_CHANGES = 100;

/** Body for `POST /quit`: the coder stops for good, optionally asking for their answers to be deleted. */
export const QuitSessionSchema = z.object({ requestDeletion: z.boolean().default(false) });
export type QuitSession = z.infer<typeof QuitSessionSchema>;

/** Body for `POST /end`: the `end` item the coder reached; without one, they finished the study. */
export const EndSessionSchema = z.object({ item: z.string().min(1).optional(), unit: EndUnitSchema.optional() });

/**
 * Whether the coder can go back after the session ended (`POST /reopen`):
 * null: not (screened out, quit, or the study's reopen time after
 * finishing is over); `until` null: always (the study keeps sessions open).
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
 * than this, unless its study keeps sessions open.
 */
export const EndValuesSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
  unit: z
    .object({ data: z.record(z.string(), z.unknown()), variables: z.record(z.string(), VariableValueSchema) })
    .nullable(),
});
export type EndValues = z.infer<typeof EndValuesSchema>;
export type EndSession = z.infer<typeof EndSessionSchema>;

/** Response for `GET /session`. */
export const SessionResponseSchema = z.object({
  sessionId: IdSchema,
  studyId: IdSchema,
  /** The deployed codebook coders get now: its coder codebook (only what coding needs). */
  codebook: CoderCodebookSchema,
  /**
   * The deployment's version: bumped on every deploy. The client sends it
   * back as `x-annotinder-version`; after a deploy the server answers
   * 409 `codebook_changed`, and the client loads the session again
   * (docs/api/coder.md).
   */
  version: z.number().int().positive(),
  progress: z.array(SetProgressSchema),
  /**
   * The coder's coder-level variables so far, including drawn random
   * conditions (experiments), so conditions in the client can use them.
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
  /** `$session` values: the URL parameters, `coder` and `source` when the session has them. */
  session: z.record(z.string(), z.string()).default({}),
  /** The email of the login this session belongs to (docs/coder-identity.md §5); null without. Logged-in coders continue on any device by logging in there. */
  login: z.string().nullable().optional(),
  /** Coders may sign in (the server has a login), and this one hasn't: offer it, to continue on other devices. */
  canLogIn: z.boolean().optional(),
  /** With `ended`: what its end screen shows. */
  endValues: EndValuesSchema.nullable().optional(),
  /** With `ended`: whether the coder can go back. */
  reopen: ReopenSchema.optional(),
  /**
   * The coder got units since they last loaded the session (the researcher
   * added or moved units to them): how many, and the deployment's message
   * for it (its `{n}` filled in). Sent once. A finished session that can
   * be reopened is opened again for them.
   */
  newUnits: z.object({ count: z.number().int().positive(), message: z.string() }).nullable().optional(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * Machine-readable `code` in error responses (`{ error, code }`) that the
 * client handles specially (docs/coder-identity.md).
 */
export const CoderErrorCodeSchema = z.enum([
  /** The coder id already has a session; retry with `x-new-session: 1` to start another. */
  "coder_has_session",
  /** A link where coders pick their name: pick one (`GET /names`), and send it as `x-coder-name` (409). */
  "name_required",
  /** The picked name is another device's (a name is the first device's that picks it): pick another (409). */
  "name_taken",
  /** The study requires sign-in (or its coders are email addresses). */
  "auth_required",
  /**
   * The coder's login isn't one of the coders (coders by email address):
   * "This email address has no access to this study".
   */
  "email_not_allowed",
  /** No link (a new session needs one), or an unknown link secret: 404. */
  "link_not_found",
  /** The researchers revoked the link: no new sessions (403). */
  "link_revoked",
  /** The link reached its maximum number of sessions (403). */
  "link_used_up",
  /** The link is no longer part of the deployed design (e.g. its set was removed): no new sessions (403). */
  "link_inactive",
  /** The device's session key belongs to another study (403). */
  "coder_key_invalid",
  /** Transfer token unknown, used or expired. */
  "transfer_invalid",
  /** A new design version was deployed since the session was loaded: load it again. */
  "codebook_changed",
  /** The session has no units in this loop: it started before `coder_set` had its values. */
  "not_assigned",
  /** The coder reached an `end` item or quit: no more units or answers. */
  "session_ended",
  /** The session ended and its study closes finished sessions: its answers can't be looked at again. */
  "session_closed",
  /** Preview only: the latest design version has issues, so it can't run. */
  "design_invalid",
  /** The design requires a URL parameter the link doesn't have. */
  "url_param_missing",
  /** A URL parameter's value isn't one the design accepts (its values, pattern or length). */
  "url_param_invalid",
  /** The researchers paused the study: no new sessions or units until they resume it (what is open can be saved). */
  "study_paused",
  /** An admin suspended the study (docs/accounts.md). */
  "study_suspended",
  /** The study reached its owner's limit on coders or answers. */
  "study_full",
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

/**
 * A study the coder takes part in, for the coder home (`/code`):
 * this device's session in a deployment (`GET /d/<id>/summary`), or a
 * logged-in coder's sessions on any device (`GET /coder/sessions`).
 * `ended`: how it ended (null: still going); `units`: units finished.
 */
export const CoderStudySchema = z.object({
  deployment: z.string(),
  /** The deployed design's public title (`public.title`); null without one. Never the study's name, which is private. */
  title: z.string().nullable(),
  started: z.coerce.date(),
  lastActive: z.coerce.date(),
  ended: z.enum(["screenout", "complete", "quit"]).nullable(),
  units: z.number().int().nonnegative(),
});
export type CoderStudy = z.infer<typeof CoderStudySchema>;
