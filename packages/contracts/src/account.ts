import { z } from "zod";
import { IdSchema } from "./common.js";

// Researchers and their API keys (researcher API, docs/api/researcher.md).
// A researcher is a user, identified by their verified email; what they may
// do in a job is their role there (job users, job.ts). The researcher UI
// uses a session cookie from logging in (`/auth/login`, an OpenID Connect
// provider); scripts (R, Python) and other systems use a personal API key:
// `authorization: Bearer <key>`.

/** `GET /me`: who the request is authenticated as. */
export const MeResponseSchema = z.object({
  email: z.string(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** `POST /me/keys`. */
export const ApiKeyWriteSchema = z.object({
  /** What the key is for, e.g. "laptop R scripts". */
  label: z.string().min(1).max(128),
});
export type ApiKeyWrite = z.infer<typeof ApiKeyWriteSchema>;

/** An API key as listed: never the key itself (the server stores only a hash). */
export const ApiKeyResponseSchema = z.object({
  id: IdSchema,
  label: z.string(),
  /** The key's first characters, to recognize it. */
  prefix: z.string(),
  created: z.coerce.date(),
  lastUsed: z.coerce.date().nullable(),
  revokedAt: z.coerce.date().nullable(),
});
export type ApiKeyResponse = z.infer<typeof ApiKeyResponseSchema>;

/** `POST /me/keys` response: the key, shown this once. */
export const ApiKeyCreatedSchema = ApiKeyResponseSchema.extend({
  key: z.string(),
});
export type ApiKeyCreated = z.infer<typeof ApiKeyCreatedSchema>;

/**
 * `GET /auth/options` (no authentication): how researchers can sign in here.
 * `login`: the server has an OpenID Connect provider (`/auth/login`).
 * `devAuth`: it accepts development headers (`x-dev-role`).
 */
export const AuthOptionsSchema = z.object({
  login: z.boolean(),
  devAuth: z.boolean(),
});
export type AuthOptions = z.infer<typeof AuthOptionsSchema>;

/** Why a login was refused, as `?loginError=` on the page the researcher returns to. */
export const LoginErrorSchema = z.enum(["email_unverified", "mfa_required", "login_failed"]);
export type LoginError = z.infer<typeof LoginErrorSchema>;
