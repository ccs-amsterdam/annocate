import { z } from "zod";
import { IdSchema } from "./common.js";
import { AccountRoleSchema, LimitsSchema } from "./account.js";

// The server admin's API (`/admin/...`, account role `admin`;
// docs/accounts.md): registration, plans and limits, users (and inviting
// them by email), requests to become a researcher, studies (suspend, owner)
// and the log of admin actions.
// Admins don't see study data: no design versions, units or answers.

/**
 * Who becomes a researcher: `open`: anyone who logs in (with a verified
 * email: a researcher role for everyone); `requests`: users may ask, and an
 * admin decides. Besides these: email domains (`DomainRule`), and admins
 * inviting or adding users (`AdminUserCreate`).
 */
export const RegistrationSchema = z.object({
  open: z.boolean(),
  requests: z.boolean(),
});
export type Registration = z.infer<typeof RegistrationSchema>;

/** `GET/PUT /admin/settings`. */
export const ServerSettingsSchema = z.object({
  registration: RegistrationSchema,
  /** The plan of researchers without another (null: no limits). */
  defaultPlanId: IdSchema.nullable(),
  /** The most one unit's data may take, in bytes (JSON). */
  unitBytes: z.number().int().min(1024),
  /** The most one answer may take, in bytes (JSON). */
  answerBytes: z.number().int().min(256),
});
export type ServerSettings = z.infer<typeof ServerSettingsSchema>;

export const PlanWriteSchema = z.object({ name: z.string().min(1).max(128), limits: LimitsSchema });
export type PlanWrite = z.infer<typeof PlanWriteSchema>;

export const PlanSchema = PlanWriteSchema.extend({ id: IdSchema });
export type Plan = z.infer<typeof PlanSchema>;

/** An email domain: `uni.nl`, or `*.uni.nl` for the domain and its subdomains. */
export const DomainSchema = z
  .string()
  .min(3)
  .max(253)
  .transform((d) => d.trim().toLowerCase())
  .refine((d) => /^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/.test(d), "A domain like uni.nl or *.uni.nl");

/** `PUT /admin/domains/:domain`: users with an email address there become researchers, and/or get a plan. */
export const DomainRuleWriteSchema = z.object({
  researcher: z.boolean(),
  planId: IdSchema.nullable(),
});
export type DomainRuleWrite = z.infer<typeof DomainRuleWriteSchema>;

export const DomainRuleSchema = DomainRuleWriteSchema.extend({ domain: z.string() });
export type DomainRule = z.infer<typeof DomainRuleSchema>;

/** A user as admins see them. */
export const AdminUserSchema = z.object({
  id: IdSchema,
  email: z.string(),
  /** Their account role (from their own role, their email domain, or open registration). */
  role: AccountRoleSchema,
  /** Where `role` comes from: their own (`user`), their email `domain`, or `everyone` (open registration); null: no role. */
  roleVia: z.enum(["user", "domain", "everyone"]).nullable(),
  /**
   * False: invited (by email) and not logged in yet: their first login with
   * a verified email at this address claims the account and its roles,
   * within 3 months of the invitation (`invitationExpired` after that).
   */
  registered: z.boolean(),
  invitationExpired: z.boolean(),
  /**
   * Roles of their own (server and studies) that the safeguards turned off:
   * given before they came back after a year away without a second factor,
   * or an invitation claimed too late. `restoreRoles` turns them on again.
   */
  rolesDisabled: z.number().int(),
  /** Their latest login used a second factor. */
  hasMfa: z.boolean(),
  /** While moving to another login provider: whether they linked their login there. */
  linked: z.boolean(),
  /** Their own plan (else the domain's or the default). */
  planId: IdSchema.nullable(),
  /** Per-limit overrides on top of the plan. */
  limits: LimitsSchema,
  /** The limits that apply (plan, domain and overrides together). */
  effectiveLimits: LimitsSchema,
  blockedAt: z.coerce.date().nullable(),
  created: z.coerce.date(),
  lastLogin: z.coerce.date().nullable(),
  /** Studies they own. */
  studies: z.number().int(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/**
 * `POST /admin/users`: invite someone by email (a shadow user, claimed at
 * their first login within 3 months), or give a user with that email a role.
 */
export const AdminUserCreateSchema = z.object({
  email: z.string().email(),
  role: AccountRoleSchema,
  planId: IdSchema.nullable().optional(),
});
export type AdminUserCreate = z.infer<typeof AdminUserCreateSchema>;

/** `PUT /admin/users/:id`: change a user; fields left out stay. Blocking ends their sessions and API keys' use. */
export const AdminUserUpdateSchema = z.object({
  role: AccountRoleSchema.optional(),
  planId: IdSchema.nullable().optional(),
  limits: LimitsSchema.optional(),
  blocked: z.boolean().optional(),
  /** Turns their own roles on again (server and studies) after the safeguards turned them off (`rolesDisabled`). */
  restoreRoles: z.literal(true).optional(),
});
export type AdminUserUpdate = z.infer<typeof AdminUserUpdateSchema>;

/** A request to become a researcher. */
export const ResearcherRequestSchema = z.object({
  userId: IdSchema,
  email: z.string(),
  message: z.string(),
  at: z.coerce.date(),
});
export type ResearcherRequest = z.infer<typeof ResearcherRequestSchema>;

/** `POST /admin/requests/:userId`: approve (the user becomes a researcher) or deny. */
export const ResearcherRequestDecisionSchema = z.object({ approve: z.boolean() });
export type ResearcherRequestDecision = z.infer<typeof ResearcherRequestDecisionSchema>;

/** A study as admins see it: no data, only what it holds. */
export const AdminStudySchema = z.object({
  id: IdSchema,
  name: z.string(),
  owner: z.string().nullable(),
  created: z.coerce.date(),
  archived: z.boolean(),
  suspendedAt: z.coerce.date().nullable(),
  units: z.number().int(),
  coders: z.number().int(),
  answers: z.number().int(),
});
export type AdminStudy = z.infer<typeof AdminStudySchema>;

/** `PUT /admin/studies/:id`: suspend (no coding, no changes; reading and deleting data still work) or move to another owner. */
export const AdminStudyUpdateSchema = z.object({
  suspended: z.boolean().optional(),
  /** The new owner's email: a researcher on this server. */
  owner: z.string().email().optional(),
});
export type AdminStudyUpdate = z.infer<typeof AdminStudyUpdateSchema>;

/** One admin action. */
export const AdminLogEntrySchema = z.object({
  at: z.coerce.date(),
  admin: z.string(),
  action: z.string(),
  target: z.string(),
  details: z.record(z.string(), z.unknown()),
});
export type AdminLogEntry = z.infer<typeof AdminLogEntrySchema>;

/**
 * Something that makes this server less secure, shown to server admins
 * (the lab's Authentication standard, "Server hardening warnings"):
 * `shared_provider`: logins come from the lab's shared OIDC provider, so the
 * server must not hold sensitive data (this can't be turned off);
 * `no_2fa_signal`: recent researcher logins came without the second factor
 * signal (`OIDC_MFA_CLAIM`), so they can't do anything but log out;
 * `migration_not_finished`: the previous provider is still configured after
 * `OIDC_PREVIOUS_UNTIL`.
 */
export const ServerWarningSchema = z.object({
  code: z.enum(["shared_provider", "no_2fa_signal", "migration_not_finished"]),
  message: z.string(),
});
export type ServerWarning = z.infer<typeof ServerWarningSchema>;
