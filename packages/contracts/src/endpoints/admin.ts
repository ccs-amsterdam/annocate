import { z } from "zod";
import {
  AdminJobSchema,
  AdminJobUpdateSchema,
  AdminLogEntrySchema,
  AdminUserCreateSchema,
  AdminUserSchema,
  AdminUserUpdateSchema,
  DomainRuleSchema,
  DomainRuleWriteSchema,
  PlanSchema,
  PlanWriteSchema,
  ResearcherInviteSchema,
  ResearcherInviteWriteSchema,
  ResearcherRequestDecisionSchema,
  ResearcherRequestSchema,
  ServerSettingsSchema,
} from "../admin.js";

/**
 * The admin API (admin.ts, docs/api/admin.md): account role `admin`, with
 * the researcher API's authentication. Every change is logged (`listAdminLog`).
 */
export const adminEndpoints = {
  getSettings: { method: "GET", path: "/admin/settings", request: z.void(), response: ServerSettingsSchema },
  putSettings: { method: "PUT", path: "/admin/settings", request: ServerSettingsSchema, response: ServerSettingsSchema },

  listPlans: { method: "GET", path: "/admin/plans", request: z.void(), response: z.array(PlanSchema) },
  createPlan: { method: "POST", path: "/admin/plans", request: PlanWriteSchema, response: PlanSchema },
  updatePlan: { method: "PUT", path: "/admin/plans/:id", request: PlanWriteSchema, response: PlanSchema },
  deletePlan: { method: "DELETE", path: "/admin/plans/:id", request: z.void(), response: z.void() },

  listDomains: { method: "GET", path: "/admin/domains", request: z.void(), response: z.array(DomainRuleSchema) },
  putDomain: { method: "PUT", path: "/admin/domains/:domain", request: DomainRuleWriteSchema, response: DomainRuleSchema },
  deleteDomain: { method: "DELETE", path: "/admin/domains/:domain", request: z.void(), response: z.void() },

  /** `?q=` filters by email; at most 200, most recent logins first. */
  listUsers: { method: "GET", path: "/admin/users", request: z.void(), response: z.array(AdminUserSchema) },
  createUser: { method: "POST", path: "/admin/users", request: AdminUserCreateSchema, response: AdminUserSchema },
  updateUser: { method: "PUT", path: "/admin/users/:id", request: AdminUserUpdateSchema, response: AdminUserSchema },

  listResearcherRequests: { method: "GET", path: "/admin/requests", request: z.void(), response: z.array(ResearcherRequestSchema) },
  decideResearcherRequest: { method: "POST", path: "/admin/requests/:userId", request: ResearcherRequestDecisionSchema, response: z.void() },

  listResearcherInvites: { method: "GET", path: "/admin/researcher-invites", request: z.void(), response: z.array(ResearcherInviteSchema) },
  createResearcherInvite: { method: "POST", path: "/admin/researcher-invites", request: ResearcherInviteWriteSchema, response: ResearcherInviteSchema },
  revokeResearcherInvite: { method: "POST", path: "/admin/researcher-invites/:id/revoke", request: z.void(), response: ResearcherInviteSchema },

  listAdminJobs: { method: "GET", path: "/admin/jobs", request: z.void(), response: z.array(AdminJobSchema) },
  updateAdminJob: { method: "PUT", path: "/admin/jobs/:id", request: AdminJobUpdateSchema, response: AdminJobSchema },

  /** Newest first, at most 500. */
  listAdminLog: { method: "GET", path: "/admin/log", request: z.void(), response: z.array(AdminLogEntrySchema) },
} as const;
