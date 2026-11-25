import { z } from "zod";
import { ClientVersionSchema } from "./version.js";

/**
 * `GET /info` (no authentication): what whoever runs this server says about
 * it, for the "About this server" page, with the version it runs. Each is a
 * server setting (docs/hosting.md, "Settings"); null: not set.
 */
export const ServerInfoSchema = z.object({
  /** Who runs the server (`ANNOTINDER_OPERATOR`). */
  operator: z.string().nullable(),
  /** Where it is hosted, in the operator's words (`ANNOTINDER_HOSTING`). */
  hosting: z.string().nullable(),
  /** How to reach the operator: an email address or other text (`ANNOTINDER_CONTACT`). */
  contact: z.string().nullable(),
  /** The server's privacy statement and terms of use (`ANNOTINDER_PRIVACY_URL`, `ANNOTINDER_TERMS_URL`): http(s) addresses. */
  privacyUrl: z.string().nullable(),
  termsUrl: z.string().nullable(),
  version: ClientVersionSchema,
});
export type ServerInfo = z.infer<typeof ServerInfoSchema>;

/** What the operator sets of it. */
export type ServerOperatorInfo = Omit<ServerInfo, "version">;

export const SERVER_INFO_PATH = "/info";
