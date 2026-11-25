import {
  adminEndpoints,
  researcherEndpoints,
  type AdminStudy,
  type AdminStudyUpdate,
  type AccountDeletion,
  type AdminLogEntry,
  type AdminUser,
  type AdminUserCreate,
  type AdminUserUpdate,
  type DomainRule,
  type DomainRuleWrite,
  type MeResponse,
  type Plan,
  type PlanWrite,
  type ResearcherRequest,
  type ServerSettings,
  type ServerWarning,
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
  /** The users matching `q`, most recently active first: the first page (searching narrows it down). */
  async listUsers(q = ""): Promise<AdminUser[]> {
    const page = await this.api.call<{ users: AdminUser[] }>(
      "GET",
      `${adminEndpoints.listUsers.path}${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    );
    return page.users;
  }
  createUser(user: AdminUserCreate): Promise<AdminUser> {
    return this.api.call("POST", adminEndpoints.createUser.path, user);
  }
  /** Withdraws an invitation: a user who hasn't logged in yet. */
  deleteInvitation(id: number): Promise<void> {
    return this.api.call("DELETE", this.path(adminEndpoints.deleteInvitation.path, { id }));
  }
  /** What deleting a user's account would delete, and what keeps it from being deleted. */
  getUserDeletion(id: number): Promise<AccountDeletion> {
    return this.api.call("GET", this.path(adminEndpoints.getUserDeletion.path, { id }));
  }
  /** Deletes a registered user's account for good; `confirm` is their email address. Sensitive. */
  deleteUser(id: number, confirm: string): Promise<void> {
    return this.api.call("DELETE", this.path(adminEndpoints.deleteUser.path, { id }), { confirm });
  }
  getWarnings(): Promise<ServerWarning[]> {
    return this.api.call("GET", adminEndpoints.getWarnings.path);
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
  listStudies(): Promise<AdminStudy[]> {
    return this.api.call("GET", adminEndpoints.listAdminStudies.path);
  }
  updateStudy(id: number, update: AdminStudyUpdate): Promise<AdminStudy> {
    return this.api.call("PUT", this.path(adminEndpoints.updateAdminStudy.path, { id }), update);
  }
  listLog(): Promise<AdminLogEntry[]> {
    return this.api.call("GET", adminEndpoints.listAdminLog.path);
  }
}
