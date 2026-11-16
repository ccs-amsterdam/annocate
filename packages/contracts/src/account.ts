import { z } from "zod";
import { IdSchema } from "./common.js";

// Researchers and their API keys (researcher API, docs/api/researcher.md).
// A researcher is a user, identified by their verified email; what they may
// do in a study is their role there (study users, study.ts). The researcher UI
// uses a session cookie from logging in (`/auth/login`, an OpenID Connect
// provider); scripts (R, Python) and other systems use a personal API key:
// `authorization: Bearer <key>`.

/**
 * What a user may do on this server (docs/accounts.md), apart from their
 * roles in studies: `user` codes and works on studies they were given a role in;
 * `researcher` also creates studies (within their limits); `admin` also manages
 * users, limits and registration. Each includes the ones before it.
 */
export const AccountRoleSchema = z.enum(["user", "researcher", "admin"]);
export type AccountRole = z.infer<typeof AccountRoleSchema>;

/** Ranks account roles: `atLeast(role, "researcher")`. */
export function accountRoleAtLeast(role: AccountRole, min: AccountRole): boolean {
  const rank = { user: 0, researcher: 1, admin: 2 };
  return rank[role] >= rank[min];
}

const limit = z.number().int().nonnegative().nullable().optional();

/**
 * Limits for a researcher: studies they own, units per study and in all their
 * studies, coders per study, answer rows per study. Missing or null: no limit.
 * They apply when something is created; nothing is deleted when they shrink.
 */
export const LimitsSchema = z.object({
  studies: limit,
  unitsPerStudy: limit,
  units: limit,
  codersPerStudy: limit,
  answersPerStudy: limit,
});
export type Limits = z.infer<typeof LimitsSchema>;

/** How much of their limits a researcher uses (studies they own). */
export const UsageSchema = z.object({ studies: z.number().int(), units: z.number().int() });
export type Usage = z.infer<typeof UsageSchema>;

/** `GET /me`: who the request is authenticated as. */
export const MeResponseSchema = z.object({
  email: z.string(),
  role: AccountRoleSchema,
  /** Their limits (plan, domain and personal overrides together), and what they use. */
  limits: LimitsSchema,
  usage: UsageSchema,
  /** A request to become a researcher, if they made one that wasn't decided yet. */
  researcherRequest: z.object({ at: z.coerce.date() }).nullable(),
  /** Whether users may ask to become researchers here (else: an admin adds them). */
  canRequestResearcher: z.boolean(),
  /**
   * The second factor, which the login provider checks (docs/security.md).
   * `required`: this login didn't use one: only coding, `GET /me` and
   * logging out work (log in again with a second factor). `freshUntil`:
   * until when sensitive actions (API keys, deleting answers, admin roles)
   * work without logging in again (step-up); null: they need a new login now.
   */
  twoFactor: z.object({ required: z.boolean(), freshUntil: z.coerce.date().nullable() }),
  /**
   * While the server moves to another login provider: this user hasn't
   * linked their login there yet (`/auth/login?link=1`), so they lose access
   * after the previous provider's end date (docs/accounts.md "Changing providers").
   */
  linkNeeded: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** `POST /me/researcher-request`: ask an admin to become a researcher. */
export const ResearcherRequestWriteSchema = z.object({ message: z.string().max(2000).default("") });
export type ResearcherRequestWrite = z.infer<typeof ResearcherRequestWriteSchema>;

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
 * `devMode`: development mode (`AUTH_DEV_MODE`): development headers
 * (`x-dev-role`) instead of logging in, on this machine only.
 */
export const AuthOptionsSchema = z.object({
  login: z.boolean(),
  devMode: z.boolean(),
  /**
   * While the server moves to another login provider: the previous one can
   * still be used (`/auth/login?provider=previous`) until `until`
   * (docs/accounts.md "Changing providers"). Null otherwise.
   */
  previous: z.object({ until: z.coerce.date() }).nullable(),
});
export type AuthOptions = z.infer<typeof AuthOptionsSchema>;

/** Why a login was refused, as `?loginError=` on the page the researcher returns to. */
export const LoginErrorSchema = z.enum([
  "email_unverified",
  "blocked",
  "login_failed",
  /** A login for a sensitive action (step-up) without a second factor, or not recent. */
  "step_up_failed",
  /** Linking a new login to this account failed: it belongs to another account, or nobody was logged in. */
  "link_failed",
]);
export type LoginError = z.infer<typeof LoginErrorSchema>;
