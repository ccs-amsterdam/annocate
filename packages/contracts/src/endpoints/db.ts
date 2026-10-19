import { z } from "zod";
import {
  DeploymentStatusSchema,
  RefreshDeploymentSchema,
} from "../deployment.js";

/**
 * The DB API (docs/api/db.md): served by the job server, called by db servers
 * (refresh, status, drop). Calls are
 * signed with the job's **call key** (`ck`, see `JobTokenRequestSchema`):
 *
 *   x-annotinder-signature: t=<unix seconds>,s=<base64url HMAC-SHA256(callKey,
 *     "<t>\n<METHOD>\n<path>\n<body>")>
 *
 * `path` is the request path (e.g. `/db/deployments/amcat.nl/42/refresh`),
 * `body` the raw body ("" if none). The job server accepts `t` within 5
 * minutes of its clock. It knows the call key from its own job token.
 */
export const JOB_SERVER_SIGNATURE_HEADER = "x-annotinder-signature";

export const dbEndpoints = {
  refreshDeployment: {
    method: "POST",
    path: "/db/deployments/:deploymentId/refresh",
    /** Optional body. */
    request: RefreshDeploymentSchema,
    /** The deployment version the job server now runs. */
    response: z.object({ version: z.number().int().positive() }),
  },
  getDeploymentStatus: {
    method: "GET",
    path: "/db/deployments/:deploymentId/status",
    request: z.void(),
    response: DeploymentStatusSchema,
  },
  dropDeployment: {
    method: "DELETE",
    path: "/db/deployments/:deploymentId",
    request: z.void(),
    response: z.void(),
  },
} as const;

export type DbEndpointName = keyof typeof dbEndpoints;
