import { z } from "zod";
import { CoderUnitResponseSchema } from "../unit.js";
import { PostUnitVariablesSchema, PostCoderVariablesSchema, VariableValueSchema } from "../variableValue.js";
import {
  SessionResponseSchema,
  EndSessionSchema,
  EndSessionResponseSchema,
  QuitSessionSchema,
  TransferResponseSchema,
  RedeemTransferSchema,
  RedeemTransferResponseSchema,
} from "../session.js";

/** The most units handed out (and, in a shared queue, leased) to a coder at once. */
export const MAX_UNIT_BATCH = 20;

/**
 * Query of `GET /loop/:loop/next`: the branch of the loop's `units` the
 * client chose (by evaluating their conditions; the server decides the
 * set). Needed only until the coder is routed in the loop; a loop with one
 * branch without a condition needs none.
 */
export const NextUnitQuerySchema = z.object({
  branch: z.coerce.number().int().min(0).optional(),
  /** How many of the coder's next units (a batch): the client asks again before it runs out. */
  count: z.coerce.number().int().min(1).max(MAX_UNIT_BATCH).default(1),
});

/** The coder's next units in a loop, in order; empty when they are done with it. */
export const NextUnitsResponseSchema = z.object({ units: z.array(CoderUnitResponseSchema) });
export type NextUnitsResponse = z.infer<typeof NextUnitsResponseSchema>;
export type NextUnitQuery = z.infer<typeof NextUnitQuerySchema>;

/**
 * The coder API (docs/api/coder.md): served by the server under
 * `/d/<deploymentId>`, called by the client's annotator (`HttpCoderApi`).
 * Paths are relative to that base: a coder is tied to one deployment by the
 * URL, and to one coder by their session cookie.
 */
export const coderEndpoints = {
  getSession: { method: "GET", path: "/session", request: z.void(), response: SessionResponseSchema },
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
  postUnitVariables: { method: "POST", path: "/variables/unit", request: PostUnitVariablesSchema, response: z.void() },
  postCoderVariables: {
    method: "POST",
    path: "/variables/coder",
    request: PostCoderVariablesSchema,
    response: z.void(),
  },
  /**
   * The coder reached an `auto` question (in the flow of the codebook): the
   * server assigns its value now, once (random or balanced, counting only
   * coders who reached it; stratified by the answers saved so far), and
   * returns it. Reached again: the same value.
   */
  assignAuto: { method: "POST", path: "/variables/auto/:name", request: z.void(), response: z.object({ value: VariableValueSchema }) },
  /** The coder reached an `end` item: the session is over (screened out or complete). */
  endSession: { method: "POST", path: "/end", request: EndSessionSchema, response: EndSessionResponseSchema },
  /** Goes back after finishing (within `reopenUntil`): the session is open again. */
  reopenSession: { method: "POST", path: "/reopen", request: z.void(), response: z.void() },
  /**
   * The coder quits: the session ends (if it hadn't), and with
   * `requestDeletion` they ask for their answers to be deleted (also after
   * the session ended). The researcher decides on the request.
   */
  quitSession: { method: "POST", path: "/quit", request: QuitSessionSchema, response: z.void() },
  createTransfer: { method: "POST", path: "/transfer", request: z.void(), response: TransferResponseSchema },
  redeemTransfer: {
    method: "POST",
    path: "/transfer/redeem",
    request: RedeemTransferSchema,
    response: RedeemTransferResponseSchema,
  },
} as const;

export type CoderEndpointName = keyof typeof coderEndpoints;
