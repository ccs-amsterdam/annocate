import { z } from "zod";
import { IdSchema } from "./common.js";

// AI assistants (MCP clients) connecting to a study (docs/api/mcp.md):
// AnnoTinder is a small OAuth authorization server for its MCP endpoint
// (`/api/mcp`). A researcher allows a client on the consent page
// (`/research/connect`), for one study they may edit.

/** What a connection may do: read the study's design, and save drafts of it (never deploy). */
export const MCP_SCOPES = ["design:read", "design:edit"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

/** A client as the consent page shows it: its own name and home page (as it states them). */
export const OAuthClientInfoSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  uri: z.string().nullable(),
  /** Where the browser goes back to afterwards (its host, to show). */
  redirectHost: z.string(),
});
export type OAuthClientInfo = z.infer<typeof OAuthClientInfoSchema>;

/** `GET /oauth/requests/:id`: an authorization request waiting for consent, and the studies it can be for. */
export const OAuthRequestInfoSchema = z.object({
  client: OAuthClientInfoSchema,
  scopes: z.array(z.enum(MCP_SCOPES)),
  /** The studies the researcher may edit (role WRITE or ADMIN): the connection is for one of them. */
  studies: z.array(z.object({ id: IdSchema, name: z.string() })),
  expires: z.coerce.date(),
});
export type OAuthRequestInfo = z.infer<typeof OAuthRequestInfoSchema>;

/** `POST /oauth/requests/:id/approve`: allow the client, for this study. */
export const OAuthApproveSchema = z.object({ studyId: IdSchema });
export type OAuthApprove = z.infer<typeof OAuthApproveSchema>;

/** Where the browser goes next: back to the client (with a code, or an error). */
export const OAuthRedirectSchema = z.object({ redirectTo: z.string() });
export type OAuthRedirect = z.infer<typeof OAuthRedirectSchema>;

/** `GET /me/connections`: an AI assistant connected to one of the researcher's studies. */
export const ConnectionSchema = z.object({
  id: IdSchema,
  client: z.object({ clientId: z.string(), name: z.string(), uri: z.string().nullable() }),
  study: z.object({ id: IdSchema, name: z.string() }),
  scopes: z.array(z.string()),
  created: z.coerce.date(),
  lastUsed: z.coerce.date().nullable(),
});
export type Connection = z.infer<typeof ConnectionSchema>;
