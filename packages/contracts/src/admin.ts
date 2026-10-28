import { z } from "zod";
import { IdSchema } from "./common.js";
import { AccountRoleSchema, LimitsSchema } from "./account.js";

// The server admin's API (`/admin/...`, account role `admin`;
// docs/accounts.md): registration, plans and limits, users, researcher
// invites and requests, jobs (suspend, owner) and the log of admin actions.
// Admins don't see job data: no codebooks, units or answers.

/**
 * Who becomes a researcher: `open`: anyone who logs in (with a verified
 * email); `requests`: users may ask, and an admin decides. Besides these:
 * email domains (`DomainRule`), researcher invite links, and admins.
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
  role: AccountRoleSchema,
  /** Their own plan (else the domain's or the default). */
  planId: IdSchema.nullable(),
  /** Per-limit overrides on top of the plan. */
  limits: LimitsSchema,
  /** The limits that apply (plan, domain and overrides together). */
  effectiveLimits: LimitsSchema,
  blockedAt: z.coerce.date().nullable(),
  created: z.coerce.date(),
  lastLogin: z.coerce.date().nullable(),
  /** Jobs they own. */
  jobs: z.number().int(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/** `POST /admin/users`: add a user before they first log in (e.g. a researcher). */
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

/** `POST /admin/researcher-invites`: a link that makes whoever logs in with it a researcher, once. */
export const ResearcherInviteWriteSchema = z.object({
  /** Who it is for, e.g. "Jane (UvA)". */
  label: z.string().min(1).max(256),
  planId: IdSchema.nullable().optional(),
  /** Days it stays valid (default 14). */
  days: z.number().int().min(1).max(365).default(14),
});
export type ResearcherInviteWrite = z.infer<typeof ResearcherInviteWriteSchema>;

export const ResearcherInviteSchema = z.object({
  id: IdSchema,
  secret: z.string(),
  label: z.string(),
  planId: IdSchema.nullable(),
  createdBy: z.string(),
  created: z.coerce.date(),
  expires: z.coerce.date(),
  usedBy: z.string().nullable(),
  usedAt: z.coerce.date().nullable(),
  revokedAt: z.coerce.date().nullable(),
});
export type ResearcherInvite = z.infer<typeof ResearcherInviteSchema>;

/** A job as admins see it: no data, only what it holds. */
export const AdminJobSchema = z.object({
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
export type AdminJob = z.infer<typeof AdminJobSchema>;

/** `PUT /admin/jobs/:id`: suspend (no coding, no changes; reading and deleting data still work) or move to another owner. */
export const AdminJobUpdateSchema = z.object({
  suspended: z.boolean().optional(),
  /** The new owner's email: a researcher on this server. */
  owner: z.string().email().optional(),
});
export type AdminJobUpdate = z.infer<typeof AdminJobUpdateSchema>;

/** One admin action. */
export const AdminLogEntrySchema = z.object({
  at: z.coerce.date(),
  admin: z.string(),
  action: z.string(),
  target: z.string(),
  details: z.record(z.string(), z.unknown()),
});
export type AdminLogEntry = z.infer<typeof AdminLogEntrySchema>;
