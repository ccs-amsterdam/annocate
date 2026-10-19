import { JOB_SERVER_SIGNATURE_HEADER } from "@annotinder/contracts";
import type { Server } from "../context.js";
import { boundJobServer } from "./deployments.js";

/** How job servers address a job on this db server: this db server's host and the job id (plan §13). */
export function deploymentId(server: Server, jobId: number): string {
  return `${new URL(server.publicUrl).host}/${jobId}`;
}

/**
 * A call to the job server the job is bound to, signed with the job's call
 * key (contracts JOB_SERVER_SIGNATURE_HEADER). `path` may contain
 * `:deploymentId`. Resolves to null when there is no job server to call.
 */
export async function callJobServer(
  server: Server,
  jobId: number,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<Response | null> {
  const bound = server.jobServer ? boundJobServer(server.db, jobId, server.jobServer.url) : null;
  if (!server.jobServer || !bound) return null;
  const fullPath = path.replace(":deploymentId", deploymentId(server, jobId));
  const text = body === undefined ? "" : JSON.stringify(body);
  const headers: Record<string, string> = {
    [JOB_SERVER_SIGNATURE_HEADER]: server.tokens.signCall(bound, jobId, method, fullPath, text),
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  return (server.jobServer.fetch ?? fetch)(bound + fullPath, {
    method,
    headers,
    body: body === undefined ? undefined : text,
  });
}
