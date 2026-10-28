import {
  adminEndpoints,
  researcherEndpoints,
  type AdminJob,
  type AdminJobUpdate,
  type AdminLogEntry,
  type AdminUser,
  type AdminUserCreate,
  type AdminUserUpdate,
  type DomainRule,
  type DomainRuleWrite,
  type MeResponse,
  type Plan,
  type PlanWrite,
  type ResearcherInvite,
  type ResearcherInviteWrite,
  type ResearcherRequest,
  type ServerSettings,
} from "@annotinder/contracts";
import type { HttpResearcherApi } from "./httpResearcherApi";

/**
 * The account and server-admin parts of the API (contracts account.ts and
 * admin.ts, docs/accounts.md), with a researcher client's authentication.
 */
export class ServerApi {
  constructor(private api: HttpResearcherApi) {}

  private path(template: string, params: Record<string, string | number> = {}): string {
    return template.replace(/:(\w+)/g, (_, p: string) => encodeURIComponent(String(params[p])));
  }

  getMe(): Promise<MeResponse> {
    return this.api.getMe();
  }
  requestResearcher(message: string): Promise<MeResponse> {
    return this.api.call("POST", researcherEndpoints.requestResearcher.path, { message });
  }
  redeemResearcherInvite(secret: string): Promise<MeResponse> {
    return this.api.call("POST", researcherEndpoints.redeemResearcherInvite.path, { secret });
  }

  getSettings(): Promise<ServerSettings> {
    return this.api.call("GET", adminEndpoints.getSettings.path);
  }
  putSettings(settings: ServerSettings): Promise<ServerSettings> {
    return this.api.call("PUT", adminEndpoints.putSettings.path, settings);
  }
  listPlans(): Promise<Plan[]> {
    return this.api.call("GET", adminEndpoints.listPlans.path);
  }
  createPlan(plan: PlanWrite): Promise<Plan> {
    return this.api.call("POST", adminEndpoints.createPlan.path, plan);
  }
  updatePlan(id: number, plan: PlanWrite): Promise<Plan> {
    return this.api.call("PUT", this.path(adminEndpoints.updatePlan.path, { id }), plan);
  }
  deletePlan(id: number): Promise<void> {
    return this.api.call("DELETE", this.path(adminEndpoints.deletePlan.path, { id }));
  }
  listDomains(): Promise<DomainRule[]> {
    return this.api.call("GET", adminEndpoints.listDomains.path);
  }
  putDomain(domain: string, rule: DomainRuleWrite): Promise<DomainRule> {
    return this.api.call("PUT", this.path(adminEndpoints.putDomain.path, { domain }), rule);
  }
  deleteDomain(domain: string): Promise<void> {
    return this.api.call("DELETE", this.path(adminEndpoints.deleteDomain.path, { domain }));
  }
  listUsers(q = ""): Promise<AdminUser[]> {
    return this.api.call("GET", `${adminEndpoints.listUsers.path}${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  }
  createUser(user: AdminUserCreate): Promise<AdminUser> {
    return this.api.call("POST", adminEndpoints.createUser.path, user);
  }
  updateUser(id: number, update: AdminUserUpdate): Promise<AdminUser> {
    return this.api.call("PUT", this.path(adminEndpoints.updateUser.path, { id }), update);
  }
  listRequests(): Promise<ResearcherRequest[]> {
    return this.api.call("GET", adminEndpoints.listResearcherRequests.path);
  }
  decideRequest(userId: number, approve: boolean): Promise<void> {
    return this.api.call("POST", this.path(adminEndpoints.decideResearcherRequest.path, { userId }), { approve });
  }
  listInvites(): Promise<ResearcherInvite[]> {
    return this.api.call("GET", adminEndpoints.listResearcherInvites.path);
  }
  createInvite(invite: ResearcherInviteWrite): Promise<ResearcherInvite> {
    return this.api.call("POST", adminEndpoints.createResearcherInvite.path, invite);
  }
  revokeInvite(id: number): Promise<ResearcherInvite> {
    return this.api.call("POST", this.path(adminEndpoints.revokeResearcherInvite.path, { id }));
  }
  listJobs(): Promise<AdminJob[]> {
    return this.api.call("GET", adminEndpoints.listAdminJobs.path);
  }
  updateJob(id: number, update: AdminJobUpdate): Promise<AdminJob> {
    return this.api.call("PUT", this.path(adminEndpoints.updateAdminJob.path, { id }), update);
  }
  listLog(): Promise<AdminLogEntry[]> {
    return this.api.call("GET", adminEndpoints.listAdminLog.path);
  }
}
