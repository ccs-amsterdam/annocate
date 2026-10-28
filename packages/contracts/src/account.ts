import { z } from "zod";
import { IdSchema } from "./common.js";

// Researchers and their API keys (researcher API, docs/api/researcher.md).
// A researcher is a user, identified by their verified email; what they may
// do in a job is their role there (job users, job.ts). The researcher UI
// uses a session cookie from logging in (`/auth/login`, an OpenID Connect
// provider); scripts (R, Python) and other systems use a personal API key:
// `authorization: Bearer <key>`.

/**
 * What a user may do on this server (docs/accounts.md), apart from their
 * roles in jobs: `user` codes and works on jobs they were given a role in;
 * `researcher` also creates jobs (within their limits); `admin` also manages
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
 * Limits for a researcher: jobs they own, units per job and in all their
 * jobs, coders per job, answer rows per job. Missing or null: no limit.
 * They apply when something is created; nothing is deleted when they shrink.
 */
export const LimitsSchema = z.object({
  jobs: limit,
  unitsPerJob: limit,
  units: limit,
  codersPerJob: limit,
  answersPerJob: limit,
});
export type Limits = z.infer<typeof LimitsSchema>;

/** How much of their limits a researcher uses (jobs they own). */
export const UsageSchema = z.object({ jobs: z.number().int(), units: z.number().int() });
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
  /** Whether users may ask to become researchers here (else: an invite link, or an admin). */
  canRequestResearcher: z.boolean(),
  /**
   * The server requires a second factor for researcher access, and this
   * login didn't use one: only coding, `GET /me` and logging out work.
   */
  mfaRequired: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** `POST /me/researcher-request`: ask an admin to become a researcher. */
export const ResearcherRequestWriteSchema = z.object({ message: z.string().max(2000).default("") });
export type ResearcherRequestWrite = z.infer<typeof ResearcherRequestWriteSchema>;

/** `POST /me/researcher-invite`: redeem a researcher invite link. */
export const RedeemResearcherInviteSchema = z.object({ secret: z.string().min(1) });
export type RedeemResearcherInvite = z.infer<typeof RedeemResearcherInviteSchema>;

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
export const LoginErrorSchema = z.enum(["email_unverified", "blocked", "login_failed"]);
export type LoginError = z.infer<typeof LoginErrorSchema>;
