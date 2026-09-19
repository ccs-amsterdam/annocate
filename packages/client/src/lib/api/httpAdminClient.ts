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
 * which is the coder-facing, annotation-time interface.
 *
 * Supports listing, creating, and selecting jobs. Per-job resources (codebooks,
 * units, unitsets, coders) are accessed via a job-scoped client created by
 * calling `client.forJob(jobId)`.
 */
export interface AdminClient {
  readonly jobId?: number;
  forJob(jobId: number): AdminClient;

  listJobs(): Promise<JobResponse[]>;
  getJob(id?: number): Promise<JobResponse | null>;
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
  /** Base URL of the server, e.g. "http://localhost:8787". */
  baseUrl: string;
  /** Dev-mode auth (design plan §6/2.4 -- replaced by HMAC-signed sessions in a real deployment). */
  devRole: "ADMIN" | "WRITE" | "READ";
  devEmail?: string;
  /** Optional job ID to scope per-job requests (codebooks, units, etc.). */
  jobId?: number;
}

/** Talks to a real server implementing the `@annotinder/contracts` admin endpoints over HTTP. */
export class HttpAdminClient implements AdminClient {
  constructor(private config: HttpAdminClientConfig) {}

  get jobId(): number | undefined {
    return this.config.jobId;
  }

  forJob(jobId: number): AdminClient {
    return new HttpAdminClient({ ...this.config, jobId });
  }

  private requireJobId(): number {
    if (this.config.jobId === undefined) {
      throw new Error("AdminClient must be scoped to a jobId (e.g. client.forJob(id)) to access job resources");
    }
    return this.config.jobId;
  }

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

  async listJobs(): Promise<JobResponse[]> {
    return this.request(endpoints.listJobs.path);
  }

  async getJob(id?: number): Promise<JobResponse | null> {
    const targetId = id ?? this.config.jobId;
    if (targetId === undefined) {
      const jobs = await this.listJobs();
      return jobs[0] ?? null;
    }
    try {
      return await this.request<JobResponse>(endpoints.getJob.path.replace(":id", String(targetId)));
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
    const jobId = this.requireJobId();
    return this.request(endpoints.listCodebooks.path.replace(":jobId", String(jobId)));
  }

  async getCodebook(id: number): Promise<CodebookResponse> {
    const jobId = this.requireJobId();
    return this.request(
      endpoints.getCodebook.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
    );
  }

  async createCodebook(body: CodebookWrite): Promise<CodebookResponse> {
    const jobId = this.requireJobId();
    return this.request(endpoints.createCodebook.path.replace(":jobId", String(jobId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateCodebook(id: number, body: CodebookWrite): Promise<CodebookResponse> {
    const jobId = this.requireJobId();
    return this.request(
      endpoints.updateCodebook.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async deleteCodebook(id: number): Promise<void> {
    const jobId = this.requireJobId();
    await this.request(
      endpoints.deleteCodebook.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
      { method: "DELETE" },
    );
  }

  async listUnits(): Promise<UnitMeta[]> {
    const jobId = this.requireJobId();
    return this.request(endpoints.listUnits.path.replace(":jobId", String(jobId)));
  }

  async getUnit(id: number): Promise<UnitResponse> {
    const jobId = this.requireJobId();
    return this.request(endpoints.getUnit.path.replace(":jobId", String(jobId)).replace(":id", String(id)));
  }

  async createUnits(body: UnitsCreateBody): Promise<UnitResponse[]> {
    const jobId = this.requireJobId();
    return this.request(endpoints.createUnits.path.replace(":jobId", String(jobId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteUnit(id: number): Promise<void> {
    const jobId = this.requireJobId();
    await this.request(endpoints.deleteUnit.path.replace(":jobId", String(jobId)).replace(":id", String(id)), {
      method: "DELETE",
    });
  }

  async listUnitsets(): Promise<UnitsetResponse[]> {
    const jobId = this.requireJobId();
    return this.request(endpoints.listUnitsets.path.replace(":jobId", String(jobId)));
  }

  async createUnitset(body: UnitsetWrite): Promise<UnitsetResponse> {
    const jobId = this.requireJobId();
    return this.request(endpoints.createUnitset.path.replace(":jobId", String(jobId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateUnitset(id: number, body: UnitsetWrite): Promise<UnitsetResponse> {
    const jobId = this.requireJobId();
    return this.request(
      endpoints.updateUnitset.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async deleteUnitset(id: number): Promise<void> {
    const jobId = this.requireJobId();
    await this.request(
      endpoints.deleteUnitset.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
      { method: "DELETE" },
    );
  }

  async listCoders(): Promise<CoderProgress[]> {
    const jobId = this.requireJobId();
    return this.request(endpoints.listCoders.path.replace(":jobId", String(jobId)));
  }

  async inviteCoder(body: CoderInviteWrite): Promise<CoderInviteResponse> {
    const jobId = this.requireJobId();
    return this.request(endpoints.inviteCoder.path.replace(":jobId", String(jobId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}
