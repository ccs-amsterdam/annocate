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
 * The client API (docs/api/client.md): served by the job server under
 * `/d/<deploymentId>`, called by the client's annotator (`HttpJobServer`).
 * Paths are relative to that base: a coder is tied to one deployment by the
 * URL, and to one coder by their session cookie.
 */
export const clientEndpoints = {
  getSession: { method: "GET", path: "/session", request: z.void(), response: SessionResponseSchema },
  getNextUnit: {
    method: "GET",
    path: "/loop/:loop/next",
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
