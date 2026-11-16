import { z } from "zod";
import {
  AdminStudySchema,
  AdminStudyUpdateSchema,
  AdminLogEntrySchema,
  AdminUserCreateSchema,
  AdminUserSchema,
  AdminUserUpdateSchema,
  DomainRuleSchema,
  DomainRuleWriteSchema,
  PlanSchema,
  PlanWriteSchema,
  ResearcherRequestDecisionSchema,
  ResearcherRequestSchema,
  ServerSettingsSchema,
  ServerWarningSchema,
} from "../admin.js";

/**
 * The admin API (admin.ts, docs/api/admin.md): account role `admin`, with
 * the researcher API's authentication. Every change is logged (`listAdminLog`).
 */
export const adminEndpoints = {
  /** What makes this server less secure (docs/security.md "Hardening warnings"). */
  getWarnings: { method: "GET", path: "/admin/warnings", request: z.void(), response: z.array(ServerWarningSchema) },
  getSettings: { method: "GET", path: "/admin/settings", request: z.void(), response: ServerSettingsSchema },
  putSettings: {
    method: "PUT",
    path: "/admin/settings",
    request: ServerSettingsSchema,
    response: ServerSettingsSchema,
  },

  listPlans: { method: "GET", path: "/admin/plans", request: z.void(), response: z.array(PlanSchema) },
  createPlan: { method: "POST", path: "/admin/plans", request: PlanWriteSchema, response: PlanSchema },
  updatePlan: { method: "PUT", path: "/admin/plans/:id", request: PlanWriteSchema, response: PlanSchema },
  deletePlan: { method: "DELETE", path: "/admin/plans/:id", request: z.void(), response: z.void() },

  listDomains: { method: "GET", path: "/admin/domains", request: z.void(), response: z.array(DomainRuleSchema) },
  putDomain: {
    method: "PUT",
    path: "/admin/domains/:domain",
    request: DomainRuleWriteSchema,
    response: DomainRuleSchema,
  },
  deleteDomain: { method: "DELETE", path: "/admin/domains/:domain", request: z.void(), response: z.void() },

  /** `?q=` filters by email; at most 200, most recent logins first. */
  listUsers: { method: "GET", path: "/admin/users", request: z.void(), response: z.array(AdminUserSchema) },
  /** Invites by email (or changes the role of a user with that email). With role `admin`: sensitive. */
  createUser: { method: "POST", path: "/admin/users", request: AdminUserCreateSchema, response: AdminUserSchema },
  /** An invitation not claimed yet (a shadow user): withdrawn. 409 for a registered user. */
  deleteInvitation: { method: "DELETE", path: "/admin/users/:id", request: z.void(), response: z.void() },
  /** Giving or taking the admin role is sensitive: a web session with a recent second factor, never an API key. */
  updateUser: { method: "PUT", path: "/admin/users/:id", request: AdminUserUpdateSchema, response: AdminUserSchema },

  listResearcherRequests: {
    method: "GET",
    path: "/admin/requests",
    request: z.void(),
    response: z.array(ResearcherRequestSchema),
  },
  decideResearcherRequest: {
    method: "POST",
    path: "/admin/requests/:userId",
    request: ResearcherRequestDecisionSchema,
    response: z.void(),
  },

  listAdminStudies: { method: "GET", path: "/admin/studies", request: z.void(), response: z.array(AdminStudySchema) },
  updateAdminStudy: {
    method: "PUT",
    path: "/admin/studies/:id",
    request: AdminStudyUpdateSchema,
    response: AdminStudySchema,
  },

  /** Newest first, at most 500. */
  listAdminLog: { method: "GET", path: "/admin/log", request: z.void(), response: z.array(AdminLogEntrySchema) },
} as const;
