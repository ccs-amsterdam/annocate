import {
  researcherEndpoints,
  type JobWrite,
  type JobResponse,
  type JobUser,
  type CodebookMeta,
  type CodebookResponse,
  type CodebookWrite,
  type UnitMeta,
  type UnitField,
  type UnitPage,
  type UnitResponse,
  type UnitsCreateBody,
  type UnitsetResponse,
  type UnitsetWrite,
  type CoderProgress,
  type CoderInviteWrite,
  type CoderInviteResponse,
  type PreviewSession,
  type DeploymentResponse,
  type DeploymentStatus,
  type DeploymentWrite,
  type JobOverview,
  type MeResponse,
  type ApiKeyResponse,
  type ApiKeyCreated,
  type AnnotationPage,
  type UnitVersionPage,
  type UnitVersionsQuery,
  type AnnotationsQuery,
  type AuthOptions,
} from "@annotinder/contracts";

/** A failed researcher API request, with its HTTP status (401: not logged in, 403: no role in the job). */
export class ResearcherApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The parsed JSON error body (`{ error, code?, ... }`), if there was one. */
    readonly body?: unknown,
  ) {
    super(message);
  }

  /** The machine-readable `code` of the error body, e.g. `codebook_conflict`. */
  get code(): string | undefined {
    const code = (this.body as { code?: unknown } | undefined)?.code;
    return typeof code === "string" ? code : undefined;
  }
}

/**
 * Client-side abstraction over the job-management ("admin") side of the API
 * (docs/client.md §7) -- distinct from `CoderApi` (api/httpCoderApi.ts),
 * which is the coder-facing, annotation-time interface.
 *
 * Supports listing, creating, and selecting jobs. Per-job resources (codebooks,
 * units, unitsets, coders) are accessed via a job-scoped client created by
 * calling `client.forJob(jobId)`.
 */
export interface ResearcherApi {
  readonly jobId?: number;
  forJob(jobId: number): ResearcherApi;

  /** How researchers can sign in on this server (no authentication needed). */
  getAuthOptions(): Promise<AuthOptions>;
  /** Ends the login session (session cookie). */
  logout(): Promise<void>;
  /** Where the browser goes to log in; it comes back to `returnTo` (a path on this origin). */
  loginUrl(returnTo: string): string;
  /** Who the client is authenticated as. */
  getMe(): Promise<MeResponse>;
  listApiKeys(): Promise<ApiKeyResponse[]>;
  /** A new API key: `key` is returned only this once. */
  createApiKey(label: string): Promise<ApiKeyCreated>;
  revokeApiKey(id: number): Promise<ApiKeyResponse>;

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
  /** The job's unit fields (set by the first upload); empty without units. */
  getUnitFields(): Promise<UnitField[]>;
  /** A page of units with data: all units, or one unitset's in its order. */
  listUnitPage(query: { offset: number; limit: number; unitset?: string }): Promise<UnitPage>;
  getUnit(id: number): Promise<UnitResponse>;
  createUnits(body: UnitsCreateBody): Promise<UnitResponse[]>;
  deleteUnit(id: number): Promise<void>;

  listUnitsets(): Promise<UnitsetResponse[]>;
  createUnitset(body: UnitsetWrite): Promise<UnitsetResponse>;
  updateUnitset(id: number, body: UnitsetWrite): Promise<UnitsetResponse>;
  deleteUnitset(id: number): Promise<void>;

  listCoders(): Promise<CoderProgress[]>;
  listInvites(): Promise<CoderInviteResponse[]>;
  createInvite(body: CoderInviteWrite): Promise<CoderInviteResponse>;
  /** No new coders from this invite; coders who already started keep working. */
  revokeInvite(id: number): Promise<CoderInviteResponse>;
  /** Only while unused: rejected once coders came in through it. */
  deleteInvite(id: number): Promise<void>;
  /** The unitset the invite's coders get in loops with "the invitation's units" (null: none). */
  setInviteUnitset(id: number, unitsetId: number | null): Promise<CoderInviteResponse>;

  /** Counts and activity for the job's overview page. */
  getOverview(): Promise<JobOverview>;

  /** The live codebook version (what coders get); null if nothing was published yet. */
  getDeployment(): Promise<DeploymentResponse | null>;
  /** Publishes a codebook version: coders switch to it, and it becomes read only. */
  putDeployment(body: DeploymentWrite): Promise<DeploymentResponse>;
  /** Progress of the live job, per loop and unitset. */
  getDeploymentStatus(): Promise<DeploymentStatus>;

  /** A preview session of the latest codebook, run in memory. */
  createPreview(): Promise<PreviewSession>;

  /** One page of annotations; pass `next` as `after` for the following page. */
  listAnnotations(query?: AnnotationsQuery): Promise<AnnotationPage>;
  /** Units as coders saw them, a page at a time. */
  listUnitVersions(query?: UnitVersionsQuery): Promise<UnitVersionPage>;
}

export interface HttpResearcherApiConfig {
  /** Base URL of the server, e.g. "http://localhost:8787". */
  baseUrl: string;
  /**
   * A researcher's API key (`authorization: Bearer`). Without one, the
   * session cookie from logging in is used: the server must then be on the
   * client's origin (baseUrl "").
   */
  apiKey?: string;
  /** Development auth headers instead of a key; only accepted by a server with ANNOTINDER_DEV_AUTH=1. */
  devRole?: "ADMIN" | "WRITE" | "READ";
  devEmail?: string;
  /** Optional job ID to scope per-job requests (codebooks, units, etc.). */
  jobId?: number;
}

/** Talks to a real server implementing the `@annotinder/contracts` admin endpoints over HTTP. */
export class HttpResearcherApi implements ResearcherApi {
  constructor(private config: HttpResearcherApiConfig) {}

  get jobId(): number | undefined {
    return this.config.jobId;
  }

  forJob(jobId: number): ResearcherApi {
    return new HttpResearcherApi({ ...this.config, jobId });
  }

  private requireJobId(): number {
    if (this.config.jobId === undefined) {
      throw new Error("ResearcherApi must be scoped to a jobId (e.g. client.forJob(id)) to access job resources");
    }
    return this.config.jobId;
  }

  private headers(): Record<string, string> {
    // `x-annotinder` lets the server accept the session cookie (against CSRF).
    const headers: Record<string, string> = { "content-type": "application/json", "x-annotinder": "1" };
    if (this.config.apiKey) {
      headers.authorization = `Bearer ${this.config.apiKey}`;
    } else if (this.config.devRole) {
      headers["x-dev-role"] = this.config.devRole;
      if (this.config.devEmail) headers["x-dev-email"] = this.config.devEmail;
    }
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, { ...init, headers: this.headers(), credentials: "same-origin" });
    if (!res.ok) {
      const body = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = undefined;
      }
      throw new ResearcherApiError(res.status, `Request to ${path} failed (${res.status}): ${body}`, parsed);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async getAuthOptions(): Promise<AuthOptions> {
    return this.request(researcherEndpoints.getAuthOptions.path);
  }

  async logout(): Promise<void> {
    await this.request(researcherEndpoints.logout.path, { method: "POST" });
  }

  /** Where the browser goes to log in; it comes back to `returnTo` (a path on this origin). */
  loginUrl(returnTo: string): string {
    return `${this.config.baseUrl}/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async getMe(): Promise<MeResponse> {
    return this.request(researcherEndpoints.getMe.path);
  }

  async listApiKeys(): Promise<ApiKeyResponse[]> {
    return this.request(researcherEndpoints.listApiKeys.path);
  }

  async createApiKey(label: string): Promise<ApiKeyCreated> {
    return this.request(researcherEndpoints.createApiKey.path, { method: "POST", body: JSON.stringify({ label }) });
  }

  async revokeApiKey(id: number): Promise<ApiKeyResponse> {
    return this.request(researcherEndpoints.revokeApiKey.path.replace(":id", String(id)), { method: "POST" });
  }

  async listAnnotations(query: AnnotationsQuery = {}): Promise<AnnotationPage> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value !== undefined) params.set(name, String(value));
    const path = researcherEndpoints.listAnnotations.path.replace(":jobId", String(this.requireJobId()));
    return this.request(params.size ? `${path}?${params}` : path);
  }

  async listUnitVersions(query: UnitVersionsQuery = {}): Promise<UnitVersionPage> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value !== undefined) params.set(name, String(value));
    const path = researcherEndpoints.listUnitVersions.path.replace(":jobId", String(this.requireJobId()));
    return this.request(params.size ? `${path}?${params}` : path);
  }

  async listJobs(): Promise<JobResponse[]> {
    return this.request(researcherEndpoints.listJobs.path);
  }

  async getJob(id?: number): Promise<JobResponse | null> {
    const targetId = id ?? this.config.jobId;
    if (targetId === undefined) {
      const jobs = await this.listJobs();
      return jobs[0] ?? null;
    }
    try {
      return await this.request<JobResponse>(researcherEndpoints.getJob.path.replace(":id", String(targetId)));
    } catch (err) {
      if (err instanceof Error && /\(404\)/.test(err.message)) return null;
      throw err;
    }
  }

  async createJob(body: JobWrite): Promise<JobResponse> {
    return this.request(researcherEndpoints.createJob.path, { method: "POST", body: JSON.stringify(body) });
  }

  async updateJob(id: number, body: JobWrite): Promise<JobResponse> {
    return this.request(researcherEndpoints.updateJob.path.replace(":id", String(id)), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async deleteJob(id: number): Promise<void> {
    await this.request(researcherEndpoints.deleteJob.path.replace(":id", String(id)), { method: "DELETE" });
  }

  async getJobUsers(id: number): Promise<JobUser[]> {
    return this.request(researcherEndpoints.getJobUsers.path.replace(":id", String(id)));
  }

  async putJobUsers(id: number, users: JobUser[]): Promise<void> {
    await this.request(researcherEndpoints.putJobUsers.path.replace(":id", String(id)), {
      method: "PUT",
      body: JSON.stringify({ users }),
    });
  }

  async listCodebooks(): Promise<CodebookMeta[]> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.listCodebooks.path.replace(":jobId", String(jobId)));
  }

  async getCodebook(id: number): Promise<CodebookResponse> {
    const jobId = this.requireJobId();
    return this.request(
      researcherEndpoints.getCodebook.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
    );
  }

  async createCodebook(body: CodebookWrite): Promise<CodebookResponse> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.createCodebook.path.replace(":jobId", String(jobId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateCodebook(id: number, body: CodebookWrite): Promise<CodebookResponse> {
    const jobId = this.requireJobId();
    return this.request(
      researcherEndpoints.updateCodebook.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async deleteCodebook(id: number): Promise<void> {
    const jobId = this.requireJobId();
    await this.request(
      researcherEndpoints.deleteCodebook.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
      { method: "DELETE" },
    );
  }

  async listUnits(): Promise<UnitMeta[]> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.listUnits.path.replace(":jobId", String(jobId)));
  }

  async getUnitFields(): Promise<UnitField[]> {
    return this.request(this.jobPath(researcherEndpoints.getUnitFields.path));
  }

  async listUnitPage(query: { offset: number; limit: number; unitset?: string }): Promise<UnitPage> {
    const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) });
    if (query.unitset) params.set("unitset", query.unitset);
    return this.request(`${this.jobPath(researcherEndpoints.listUnitPage.path)}?${params}`);
  }

  async getUnit(id: number): Promise<UnitResponse> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.getUnit.path.replace(":jobId", String(jobId)).replace(":id", String(id)));
  }

  async createUnits(body: UnitsCreateBody): Promise<UnitResponse[]> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.createUnits.path.replace(":jobId", String(jobId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteUnit(id: number): Promise<void> {
    const jobId = this.requireJobId();
    await this.request(researcherEndpoints.deleteUnit.path.replace(":jobId", String(jobId)).replace(":id", String(id)), {
      method: "DELETE",
    });
  }

  async listUnitsets(): Promise<UnitsetResponse[]> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.listUnitsets.path.replace(":jobId", String(jobId)));
  }

  async createUnitset(body: UnitsetWrite): Promise<UnitsetResponse> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.createUnitset.path.replace(":jobId", String(jobId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateUnitset(id: number, body: UnitsetWrite): Promise<UnitsetResponse> {
    const jobId = this.requireJobId();
    return this.request(
      researcherEndpoints.updateUnitset.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async deleteUnitset(id: number): Promise<void> {
    const jobId = this.requireJobId();
    await this.request(
      researcherEndpoints.deleteUnitset.path.replace(":jobId", String(jobId)).replace(":id", String(id)),
      { method: "DELETE" },
    );
  }


  async listCoders(): Promise<CoderProgress[]> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.listCoders.path.replace(":jobId", String(jobId)));
  }

  private jobPath(path: string, id?: number): string {
    const withJob = path.replace(":jobId", String(this.requireJobId()));
    return id === undefined ? withJob : withJob.replace(":id", String(id));
  }

  async listInvites(): Promise<CoderInviteResponse[]> {
    return this.request(this.jobPath(researcherEndpoints.listInvites.path));
  }

  async createInvite(body: CoderInviteWrite): Promise<CoderInviteResponse> {
    return this.request(this.jobPath(researcherEndpoints.createInvite.path), { method: "POST", body: JSON.stringify(body) });
  }

  async revokeInvite(id: number): Promise<CoderInviteResponse> {
    return this.request(this.jobPath(researcherEndpoints.revokeInvite.path, id), { method: "POST" });
  }

  async deleteInvite(id: number): Promise<void> {
    return this.request(this.jobPath(researcherEndpoints.deleteInvite.path, id), { method: "DELETE" });
  }

  async setInviteUnitset(id: number, unitsetId: number | null): Promise<CoderInviteResponse> {
    return this.request(this.jobPath(researcherEndpoints.setInviteUnitset.path, id), {
      method: "PUT",
      body: JSON.stringify({ unitsetId }),
    });
  }

  async getOverview(): Promise<JobOverview> {
    return this.request(this.jobPath(researcherEndpoints.getOverview.path));
  }

  async getDeploymentStatus(): Promise<DeploymentStatus> {
    return this.request(this.jobPath(researcherEndpoints.getDeploymentStatus.path));
  }

  async getDeployment(): Promise<DeploymentResponse | null> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.getDeployment.path.replace(":jobId", String(jobId)));
  }

  async putDeployment(body: DeploymentWrite): Promise<DeploymentResponse> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.putDeployment.path.replace(":jobId", String(jobId)), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async createPreview(): Promise<PreviewSession> {
    const jobId = this.requireJobId();
    return this.request(researcherEndpoints.createPreview.path.replace(":jobId", String(jobId)), { method: "POST" });
  }
}
