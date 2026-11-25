import { SERVER_INFO_PATH, ServerInfoSchema, type ServerInfo } from "@annotinder/contracts";

/** What the server's operator says about it, and its version (no authentication). */
export async function loadServerInfo(apiUrl: string): Promise<ServerInfo> {
  const res = await fetch(`${apiUrl}${SERVER_INFO_PATH}`);
  if (!res.ok) throw new Error(`Request to ${SERVER_INFO_PATH} failed (${res.status})`);
  return ServerInfoSchema.parse(await res.json());
}
