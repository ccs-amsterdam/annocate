import {
  endpoints,
  type JobWrite,
  type JobResponse,
  type JobUser,
  type CodebookMeta,
  type CodebookResponse,
  type CodebookWrite,
  type UnitMeta,
  type UnitResponse,
  type UnitsCreateBody,
  type UnitsetResponse,
  type UnitsetWrite,
  type CoderProgress,
  type CoderInviteWrite,
  type CoderInviteResponse,
} from "@annotinder/contracts";

/**
 * Client-side abstraction over the job-management ("admin") side of the API
 * (design plan §5 Phase 5) -- distinct from `JobServer` (api/httpJobServer.ts),
 * which is the coder-facing, annotation-time interface. A job has exactly one
 * server-side job document (design plan §3: "single job per deployment"), so
 * there's no "list of jobs" here -- only get/create/update the one job.
 */
export interface AdminClient {
  getJob(): Promise<JobResponse | null>;
  createJob(body: JobWrite): Promise<JobResponse>;
  updateJob(id: number, body: JobWrite): Promise<JobResponse>;
  deleteJob(id: number): Promise<void>;
  getJobUsers(id: number): Promise<JobUser[]>;
  putJobUsers(id: number, users: JobUser[]): Promise<void>;

  listCodebooks(): Promise<CodebookMeta[]>;
  getCodebook(id: number): Promise<CodebookResponse>;
  createCodebook(body: CodebookWrite): Promise<CodebookResponse>;
  updateCodebook(id: number, body: CodebookWrite): Promise<CodebookResponse>;
  deleteCodebook(id: number): Promise<void>;

  listUnits(): Promise<UnitMeta[]>;
  getUnit(id: number): Promise<UnitResponse>;
  createUnits(body: UnitsCreateBody): Promise<UnitResponse[]>;
  deleteUnit(id: number): Promise<void>;

  listUnitsets(): Promise<UnitsetResponse[]>;
  createUnitset(body: UnitsetWrite): Promise<UnitsetResponse>;
  updateUnitset(id: number, body: UnitsetWrite): Promise<UnitsetResponse>;
  deleteUnitset(id: number): Promise<void>;

  listCoders(): Promise<CoderProgress[]>;
  inviteCoder(body: CoderInviteWrite): Promise<CoderInviteResponse>;
}

export interface HttpAdminClientConfig {
  /** Base URL of the job's server, e.g. "http://localhost:8787". */
  baseUrl: string;
  /** Dev-mode auth (design plan §6/2.4 -- replaced by HMAC-signed sessions in a real deployment). */
  devRole: "ADMIN" | "WRITE" | "READ";
  devEmail?: string;
}

/** Talks to a real server implementing the `@annotinder/contracts` admin endpoints over HTTP. */
export class HttpAdminClient implements AdminClient {
  constructor(private config: HttpAdminClientConfig) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-dev-role": this.config.devRole,
    };
    if (this.config.devEmail) headers["x-dev-email"] = this.config.devEmail;
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, { ...init, headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Request to ${path} failed (${res.status}): ${body}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /**
   * There's no `GET /job` (list) endpoint -- only `GET /job/:id` -- but since
   * it's a single-job-per-deployment model, the client doesn't know the id
   * up front either. We use id `1` as a bootstrap guess (the first/only job
   * a fresh server will ever have); if that 404s, no job exists yet.
   */
  async getJob(): Promise<JobResponse | null> {
    try {
      return await this.request<JobResponse>(endpoints.getJob.path.replace(":id", "1"));
    } catch (err) {
      if (err instanceof Error && /\(404\)/.test(err.message)) return null;
      throw err;
    }
  }

  async createJob(body: JobWrite): Promise<JobResponse> {
    return this.request(endpoints.createJob.path, { method: "POST", body: JSON.stringify(body) });
  }

  async updateJob(id: number, body: JobWrite): Promise<JobResponse> {
    return this.request(endpoints.updateJob.path.replace(":id", String(id)), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async deleteJob(id: number): Promise<void> {
    await this.request(endpoints.deleteJob.path.replace(":id", String(id)), { method: "DELETE" });
  }

  async getJobUsers(id: number): Promise<JobUser[]> {
    return this.request(endpoints.getJobUsers.path.replace(":id", String(id)));
  }

  async putJobUsers(id: number, users: JobUser[]): Promise<void> {
    await this.request(endpoints.putJobUsers.path.replace(":id", String(id)), {
      method: "PUT",
      body: JSON.stringify({ users }),
    });
  }

  async listCodebooks(): Promise<CodebookMeta[]> {
    return this.request(endpoints.listCodebooks.path);
  }

  async getCodebook(id: number): Promise<CodebookResponse> {
    return this.request(endpoints.getCodebook.path.replace(":id", String(id)));
  }

  async createCodebook(body: CodebookWrite): Promise<CodebookResponse> {
    return this.request(endpoints.createCodebook.path, { method: "POST", body: JSON.stringify(body) });
  }

  async updateCodebook(id: number, body: CodebookWrite): Promise<CodebookResponse> {
    return this.request(endpoints.updateCodebook.path.replace(":id", String(id)), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async deleteCodebook(id: number): Promise<void> {
    await this.request(endpoints.deleteCodebook.path.replace(":id", String(id)), { method: "DELETE" });
  }

  async listUnits(): Promise<UnitMeta[]> {
    return this.request(endpoints.listUnits.path);
  }

  async getUnit(id: number): Promise<UnitResponse> {
    return this.request(endpoints.getUnit.path.replace(":id", String(id)));
  }

  async createUnits(body: UnitsCreateBody): Promise<UnitResponse[]> {
    return this.request(endpoints.createUnits.path, { method: "POST", body: JSON.stringify(body) });
  }

  async deleteUnit(id: number): Promise<void> {
    await this.request(endpoints.deleteUnit.path.replace(":id", String(id)), { method: "DELETE" });
  }

  async listUnitsets(): Promise<UnitsetResponse[]> {
    return this.request(endpoints.listUnitsets.path);
  }

  async createUnitset(body: UnitsetWrite): Promise<UnitsetResponse> {
    return this.request(endpoints.createUnitset.path, { method: "POST", body: JSON.stringify(body) });
  }

  async updateUnitset(id: number, body: UnitsetWrite): Promise<UnitsetResponse> {
    return this.request(endpoints.updateUnitset.path.replace(":id", String(id)), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async deleteUnitset(id: number): Promise<void> {
    await this.request(endpoints.deleteUnitset.path.replace(":id", String(id)), { method: "DELETE" });
  }

  async listCoders(): Promise<CoderProgress[]> {
    return this.request(endpoints.listCoders.path);
  }

  async inviteCoder(body: CoderInviteWrite): Promise<CoderInviteResponse> {
    return this.request(endpoints.inviteCoder.path, { method: "POST", body: JSON.stringify(body) });
  }
}
