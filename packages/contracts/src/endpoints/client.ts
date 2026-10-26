import { z } from "zod";
import { CoderUnitResponseSchema } from "../unit.js";
import { PostUnitVariablesSchema, PostCoderVariablesSchema } from "../variableValue.js";
import {
  SessionResponseSchema,
  TransferResponseSchema,
  RedeemTransferSchema,
  RedeemTransferResponseSchema,
} from "../session.js";

/**
 * Query of `GET /loop/:loop/next`: the branch of the loop's `units` the client
 * chose (the first whose `when` matches, evaluated on the client) and its
 * unitset names with `$var` references filled in, one per source (repeat
 * `unitsets`). Required the first time a coder enters a loop, unless the loop
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
 * The client API (docs/api/client.md): served by the server under
 * `/d/<deploymentId>`, called by the client's annotator (`HttpJobServer`).
 * Paths are relative to that base: a coder is tied to one deployment by the
 * URL, and to one coder by their session cookie.
 */
export const clientEndpoints = {
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
  createTransfer: { method: "POST", path: "/transfer", request: z.void(), response: TransferResponseSchema },
  redeemTransfer: {
    method: "POST",
    path: "/transfer/redeem",
    request: RedeemTransferSchema,
    response: RedeemTransferResponseSchema,
  },
} as const;

export type ClientEndpointName = keyof typeof clientEndpoints;
