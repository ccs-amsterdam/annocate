import { z } from "zod";
import { CoderUnitResponseSchema } from "../unit.js";
import { PostUnitVariablesSchema, PostCoderVariablesSchema, VariableValueSchema } from "../variableValue.js";
import {
  SessionResponseSchema,
  CoderStudySchema,
  EndSessionSchema,
  EndSessionResponseSchema,
  QuitSessionSchema,
  TransferResponseSchema,
  RedeemTransferSchema,
  RedeemTransferResponseSchema,
  DisplayEntrySchema,
} from "../session.js";

/** The most units handed out (and, in a shared queue, leased) to a coder at once. */
export const MAX_UNIT_BATCH = 20;

/** Query of `GET /loop/:loop/next`. */
export const NextUnitQuerySchema = z.object({
  /** How many of the coder's next units (a batch): the client asks again before it runs out. */
  count: z.coerce.number().int().min(1).max(MAX_UNIT_BATCH).default(1),
});

/** The coder's next units in a loop, in order; empty when they are done with it. */
export const NextUnitsResponseSchema = z.object({ units: z.array(CoderUnitResponseSchema) });
export type NextUnitsResponse = z.infer<typeof NextUnitsResponseSchema>;
export type NextUnitQuery = z.infer<typeof NextUnitQuerySchema>;

/** The answer to a submitted unit (`postUnitVariables`). */
export const SubmitUnitResponseSchema = z.object({
  /** Gold checks ended the session (health ran out) at this end item. */
  end: z.string().optional(),
});
export type SubmitUnitResponse = z.infer<typeof SubmitUnitResponseSchema>;

/** The names coders pick from on a `pick_name` link (`GET /names`): a coder's name, and whether it is taken. */
export const PickNamesResponseSchema = z.object({
  names: z.array(z.object({ name: z.string(), taken: z.boolean() })),
});
export type PickNamesResponse = z.infer<typeof PickNamesResponseSchema>;

/**
 * The coder API (docs/api/coder.md): served by the server under
 * `/d/<deploymentId>`, called by the client's coding screen (`HttpCoderApi`).
 * Paths are relative to that base: a coder is tied to one deployment by the
 * URL, and to one session by their session cookie.
 */
export const coderEndpoints = {
  getSession: { method: "GET", path: "/session", request: z.void(), response: SessionResponseSchema },
  /**
   * This device's session in the deployment, summarized for the coder's
   * home (404 without one). Never starts a session. `x-url-params` with the
   * coder id finds the session of a link that carries one.
   */
  getSummary: { method: "GET", path: "/summary", request: z.void(), response: CoderStudySchema },
  getNextUnits: {
    method: "GET",
    path: "/loop/:loop/next",
    query: NextUnitQuerySchema,
    request: z.void(),
    response: NextUnitsResponseSchema,
  },
  /** A unit the coder already has in this loop (finished or in progress), e.g. to go back to it after resuming. */
  getLoopUnit: {
    method: "GET",
    path: "/loop/:loop/units/:unitId",
    request: z.void(),
    response: CoderUnitResponseSchema,
  },
  /**
   * A finished unit. When gold checks ended the session (health ran out),
   * the end item it ended at (practice is checked in the browser).
   */
  postUnitVariables: {
    method: "POST",
    path: "/variables/unit",
    request: PostUnitVariablesSchema,
    response: SubmitUnitResponseSchema,
  },
  postCoderVariables: {
    method: "POST",
    path: "/variables/coder",
    request: PostCoderVariablesSchema,
    response: z.void(),
  },
  /**
   * The coder reached an experiment (in the flow of the design): the
   * server draws its condition now, once (random or balanced, counting only
   * coders who reached it; stratified by the answers saved so far), and
   * returns it. Reached again: the same value.
   */
  assignCondition: {
    method: "POST",
    path: "/experiment/:name",
    request: z.void(),
    response: z.object({ value: VariableValueSchema }),
  },
  /** The coder reached an `end` item: the session is over (screened out or complete). */
  endSession: { method: "POST", path: "/end", request: EndSessionSchema, response: EndSessionResponseSchema },
  /** Goes back after finishing (while the session's `reopen` allows it): the session is open again. */
  reopenSession: { method: "POST", path: "/reopen", request: z.void(), response: z.void() },
  /**
   * The coder quits: the session ends (if it hadn't), and with
   * `requestDeletion` they ask for their answers to be deleted (also after
   * the session ended). The researcher decides on the request.
   */
  quitSession: { method: "POST", path: "/quit", request: QuitSessionSchema, response: z.void() },
  createTransfer: { method: "POST", path: "/transfer", request: z.void(), response: TransferResponseSchema },
  /** How the coder's screen looks now (keys, width class, theme): recorded when it changed. */
  postDisplay: { method: "POST", path: "/display", request: DisplayEntrySchema, response: z.void() },
  /**
   * A `pick_name` link's names (with `x-link-secret`): the coders' column's
   * values, and which are taken (another device's, where a name is the first
   * device's that picks it). Starts no session.
   */
  getNames: { method: "GET", path: "/names", request: z.void(), response: PickNamesResponseSchema },
  redeemTransfer: {
    method: "POST",
    path: "/transfer/redeem",
    request: RedeemTransferSchema,
    response: RedeemTransferResponseSchema,
  },
} as const;

export type CoderEndpointName = keyof typeof coderEndpoints;

/**
 * Outside a deployment (`/api/coder/...`): a logged-in coder's studies on
 * any device, by their login's email (401 without a login).
 */
export const coderAccountEndpoints = {
  listSessions: { method: "GET", path: "/coder/sessions", request: z.void(), response: z.array(CoderStudySchema) },
} as const;
