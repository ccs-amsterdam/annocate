import { z } from "zod";
import { CoderUnitResponseSchema } from "../unit.js";
import { PostUnitVariablesSchema, PostCoderVariablesSchema } from "../variableValue.js";
import {
  SessionResponseSchema,
  EndSessionSchema,
  EndSessionResponseSchema,
  QuitSessionSchema,
  TransferResponseSchema,
  RedeemTransferSchema,
  RedeemTransferResponseSchema,
} from "../session.js";

/**
 * Query of `GET /loop/:loop/next`: the branch of the loop's `units` the client
 * chose (the first whose `when` matches, evaluated on the client) and its
 * unitset names with `$var` references filled in, in the order of
 * `branchUnitsets` (repeat `unitsets`; an empty one where the server picks
 * the set: `sets` and `invitation` mode). Required the first time a coder enters a loop, unless the loop
 * has a single unconditional branch without references (409
 * `branch_required` otherwise). Ignored once the coder is routed: routing
 * is sticky.
 */
export const NextUnitQuerySchema = z.object({
  branch: z.coerce.number().int().min(0).optional(),
  unitsets: z.union([z.string(), z.array(z.string())]).optional(),
});
export type NextUnitQuery = z.infer<typeof NextUnitQuerySchema>;

/**
 * The coder API (docs/api/coder.md): served by the server under
 * `/d/<deploymentId>`, called by the client's annotator (`HttpCoderApi`).
 * Paths are relative to that base: a coder is tied to one deployment by the
 * URL, and to one coder by their session cookie.
 */
export const coderEndpoints = {
  getSession: { method: "GET", path: "/session", request: z.void(), response: SessionResponseSchema },
  getNextUnit: {
    method: "GET",
    path: "/loop/:loop/next",
    query: NextUnitQuerySchema,
    request: z.void(),
    response: CoderUnitResponseSchema.nullable(),
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
