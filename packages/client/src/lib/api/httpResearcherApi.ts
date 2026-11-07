import {
  researcherEndpoints,
  type StudyWrite,
  type ExampleSummary,
  type StudyFromExample,
  type RecipeInput,
  type StudyResponse,
  type StudyUser,
  type DeleteCoders,
  type ResetAnnotations,
  type DeleteCodersResponse,
  type DesignVersionMeta,
  type DesignVersion,
  type DesignWrite,
  type UnitMeta,
  type UnitField,
  type UnitPage,
  type UnitResponse,
  type UnitsCreateBody,
  type SetGroupResponse,
  type SetGroupWrite,
  type CoderDeletion,
  type Device,
  type CoderProgress,
  type LinkWrite,
  type LinkResponse,
  type PreviewSession,
  type DeploymentResponse,
  type DeploymentStatus,
  type DeploymentVersion,
  type ClientVersion,
  type DeploymentWrite,
  type PendingChanges,
  type StudyOverview,
  type MeResponse,
  type Passkey,
  type ApiKeyResponse,
  type ApiKeyCreated,
  type AnnotationPage,
  type UnitVersionPage,
  type UnitVersionsQuery,
  type AnnotationsQuery,
  type AuthOptions,
} from "@annotinder/contracts";

/** A failed researcher API request, with its HTTP status (401: not logged in, 403: no role in the study). */
export class ResearcherApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The parsed JSON error body (`{ error, code?, ... }`), if there was one. */
    readonly body?: unknown,
  ) {
    super(message);
  }

  /** The server's message (`error` of the body), else the whole message. */
  get reason(): string {
    const error = (this.body as { error?: unknown } | undefined)?.error;
    return typeof error === "string" ? error : this.message;
  }

  /** The machine-readable `code` of the error body, e.g. `design_conflict`. */
  get code(): string | undefined {
    const code = (this.body as { code?: unknown } | undefined)?.code;
    return typeof code === "string" ? code : undefined;
  }
}

/**
 * Client-side abstraction over the study-management ("admin") side of the API
 * (docs/client.md §7) -- distinct from `CoderApi` (api/httpCoderApi.ts),
 * which is the coder-facing, annotation-time interface.
 *
 * Supports listing, creating, and selecting studies. Per-study resources (design versions,
 * units, set groups, coders) are accessed via a study-scoped client created by
 * calling `client.forStudy(studyId)`.
 */
export interface ResearcherApi {
  readonly studyId?: number;
  forStudy(studyId: number): ResearcherApi;

  /** How researchers can sign in on this server (no authentication needed). */
  getAuthOptions(): Promise<AuthOptions>;
  /** Ends the login session (session cookie). */
  logout(): Promise<void>;
  /** Where the browser goes to log in; it comes back to `returnTo` (a path on this origin). */
  loginUrl(returnTo: string): string;
  /** Who the client is authenticated as. */
  getMe(): Promise<MeResponse>;
  /** Passkeys (ANNOTINDER_2FA=annotinder): the WebAuthn ceremonies' options and results are @simplewebauthn's JSON. */
  passkeyRegisterOptions(): Promise<unknown>;
  passkeyRegister(response: unknown, name: string): Promise<{ recoveryCodes: string[] | null }>;
  passkeyLoginOptions(): Promise<unknown>;
  passkeyLogin(response: unknown): Promise<void>;
  passkeyRecover(code: string): Promise<void>;
  listPasskeys(): Promise<Passkey[]>;
  deletePasskey(id: number): Promise<void>;
  renewRecoveryCodes(): Promise<{ recoveryCodes: string[] }>;
  listApiKeys(): Promise<ApiKeyResponse[]>;
  /** A new API key: `key` is returned only this once. */
  createApiKey(label: string): Promise<ApiKeyCreated>;
  revokeApiKey(id: number): Promise<ApiKeyResponse>;

  listStudies(): Promise<StudyResponse[]>;
  getStudy(id?: number): Promise<StudyResponse | null>;
  createStudy(body: StudyWrite): Promise<StudyResponse>;
  /** The example studies AnnoTinder ships (docs/plans/examples.md). */
  listExamples(): Promise<ExampleSummary[]>;
  /** A new study from an example: units, a deployed codebook, a link and example answers. */
  createStudyFromExample(body: StudyFromExample): Promise<StudyResponse>;
  /** A new study from a recipe (the setup wizard): units, set groups, a codebook (a draft unless `publish`; deploying makes its links). */
  createStudyFromRecipe(body: RecipeInput): Promise<StudyResponse>;
  updateStudy(id: number, body: StudyWrite): Promise<StudyResponse>;
  deleteStudy(id: number): Promise<void>;
  getStudyUsers(id: number): Promise<StudyUser[]>;
  putStudyUsers(id: number, users: StudyUser[]): Promise<void>;

  listDesignVersions(): Promise<DesignVersionMeta[]>;
  getDesignVersion(id: number): Promise<DesignVersion>;
  createDesignVersion(body: DesignWrite): Promise<DesignVersion>;
  updateDesignVersion(id: number, body: DesignWrite): Promise<DesignVersion>;
  deleteDesignVersion(id: number): Promise<void>;

  listUnits(): Promise<UnitMeta[]>;
  /** The study's unit fields (set by the first upload); empty without units. */
  getUnitFields(): Promise<UnitField[]>;
  putUnitFields(fields: UnitField[]): Promise<UnitField[]>;
  /** A page of units with data: all units, or one set's (of a group) in its order. */
  listUnitPage(query: { offset: number; limit: number; group?: string; set?: string }): Promise<UnitPage>;
  getUnit(id: number): Promise<UnitResponse>;
  createUnits(body: UnitsCreateBody): Promise<UnitResponse[]>;
  deleteUnit(id: number): Promise<void>;

  /** The set groups (docs/plans/sets-and-session-parameters.md §1). */
  listSetGroups(live?: boolean): Promise<SetGroupResponse[]>;
  /** Makes or replaces a group; links with the group's sets follow. */
  putSetGroup(group: string, body: SetGroupWrite): Promise<SetGroupResponse>;
  /** Refused (409) while the codebook uses the group. */
  deleteSetGroup(group: string): Promise<void>;

  listCoders(): Promise<CoderProgress[]>;
  /** Deletes coders and all their answers for good, by id, participant id or email (ADMIN). */
  deleteCoders(select: DeleteCoders): Promise<DeleteCodersResponse>;
  /** Deletes later: the coder's deletion request stays, but is no longer brought up (ADMIN). */
  postponeDeletion(coderId: number): Promise<void>;
  /** The study's deletion log, newest first. */
  listCoderDeletions(): Promise<CoderDeletion[]>;
  /** The links (made from the deployed codebook), active ones first. */
  listLinks(): Promise<LinkResponse[]>;
  /** A link's access settings: label, login, emails, max uses, participant id. */
  updateLink(id: number, body: LinkWrite): Promise<LinkResponse>;
  /** No new coders from this link; coders who started keep working. */
  revokeLink(id: number): Promise<LinkResponse>;
  /** A new secret: the old link stops working. */
  renewLinkSecret(id: number): Promise<LinkResponse>;

  /** Counts and activity for the study's overview page. */
  getOverview(): Promise<StudyOverview>;

  /** The live design version (what coders get); null if nothing was deployed yet. */
  getDeployment(): Promise<DeploymentResponse | null>;
  /** Deploys a design version: coders switch to it, and it becomes read only. */
  putDeployment(body: DeploymentWrite): Promise<DeploymentResponse>;
  getPendingChanges(): Promise<PendingChanges>;
  listDeploymentVersions(): Promise<DeploymentVersion[]>;
  /** The server's (and its client's) release and commit (`GET /health`): what a design file exported now records. */
  getServerVersion(): Promise<ClientVersion>;
  /** Progress of the live study, per loop and set. */
  getDeploymentStatus(): Promise<DeploymentStatus>;
  /** Retires live answers, so units are coded again (ADMIN). */
  resetAnnotations(body: ResetAnnotations): Promise<{ retired: number }>;

  /** A preview session of the latest codebook, run in memory. */
  createPreview(): Promise<PreviewSession>;

  /** One page of annotations; pass `next` as `after` for the following page. */
  listAnnotations(query?: AnnotationsQuery): Promise<AnnotationPage>;
  /** Units as coders saw them, a page at a time. */
  listUnitVersions(query?: UnitVersionsQuery): Promise<UnitVersionPage>;
  /** The devices coders used, for the export. */
  listDevices(): Promise<Device[]>;
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
  /** Optional study ID to scope per-study requests (design versions, units, etc.). */
  studyId?: number;
}

/** Talks to a real server implementing the `@annotinder/contracts` admin endpoints over HTTP. */
export class HttpResearcherApi implements ResearcherApi {
  constructor(private config: HttpResearcherApiConfig) {}

  get studyId(): number | undefined {
    return this.config.studyId;
  }

  forStudy(studyId: number): ResearcherApi {
    return new HttpResearcherApi({ ...this.config, studyId });
  }

  private requireStudyId(): number {
    if (this.config.studyId === undefined) {
      throw new Error("ResearcherApi must be scoped to a studyId (e.g. client.forStudy(id)) to access study resources");
    }
    return this.config.studyId;
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

  /** Any endpoint of the server (e.g. the admin API, `serverApi.ts`), with this client's authentication. */
  call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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

  async passkeyRegisterOptions(): Promise<unknown> {
    return this.request(researcherEndpoints.passkeyRegisterOptions.path, { method: "POST" });
  }

  async passkeyRegister(response: unknown, name: string): Promise<{ recoveryCodes: string[] | null }> {
    return this.request(researcherEndpoints.passkeyRegister.path, { method: "POST", body: JSON.stringify({ response, name }) });
  }

  async passkeyLoginOptions(): Promise<unknown> {
    return this.request(researcherEndpoints.passkeyLoginOptions.path, { method: "POST" });
  }

  async passkeyLogin(response: unknown): Promise<void> {
    await this.request(researcherEndpoints.passkeyLogin.path, { method: "POST", body: JSON.stringify({ response }) });
  }

  async passkeyRecover(code: string): Promise<void> {
    await this.request(researcherEndpoints.passkeyRecover.path, { method: "POST", body: JSON.stringify({ code }) });
  }

  async listPasskeys(): Promise<Passkey[]> {
    return this.request(researcherEndpoints.listPasskeys.path);
  }

  async deletePasskey(id: number): Promise<void> {
    await this.request(researcherEndpoints.deletePasskey.path.replace(":id", String(id)), { method: "DELETE" });
  }

  async renewRecoveryCodes(): Promise<{ recoveryCodes: string[] }> {
    return this.request(researcherEndpoints.renewRecoveryCodes.path, { method: "POST" });
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
    const path = researcherEndpoints.listAnnotations.path.replace(":studyId", String(this.requireStudyId()));
    return this.request(params.size ? `${path}?${params}` : path);
  }

  async listDevices(): Promise<Device[]> {
    return this.request(this.studyPath(researcherEndpoints.listDevices.path));
  }

  async listUnitVersions(query: UnitVersionsQuery = {}): Promise<UnitVersionPage> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value !== undefined) params.set(name, String(value));
    const path = researcherEndpoints.listUnitVersions.path.replace(":studyId", String(this.requireStudyId()));
    return this.request(params.size ? `${path}?${params}` : path);
  }

  async listStudies(): Promise<StudyResponse[]> {
    return this.request(researcherEndpoints.listStudies.path);
  }

  async getStudy(id?: number): Promise<StudyResponse | null> {
    const targetId = id ?? this.config.studyId;
    if (targetId === undefined) {
      const studies = await this.listStudies();
      return studies[0] ?? null;
    }
    try {
      return await this.request<StudyResponse>(researcherEndpoints.getStudy.path.replace(":id", String(targetId)));
    } catch (err) {
      if (err instanceof Error && /\(404\)/.test(err.message)) return null;
      throw err;
    }
  }

  async createStudy(body: StudyWrite): Promise<StudyResponse> {
    return this.request(researcherEndpoints.createStudy.path, { method: "POST", body: JSON.stringify(body) });
  }

  async listExamples(): Promise<ExampleSummary[]> {
    return this.request(researcherEndpoints.listExamples.path);
  }

  async createStudyFromExample(body: StudyFromExample): Promise<StudyResponse> {
    return this.request(researcherEndpoints.createStudyFromExample.path, { method: "POST", body: JSON.stringify(body) });
  }

  async createStudyFromRecipe(body: RecipeInput): Promise<StudyResponse> {
    return this.request(researcherEndpoints.createStudyFromRecipe.path, { method: "POST", body: JSON.stringify(body) });
  }

  async updateStudy(id: number, body: StudyWrite): Promise<StudyResponse> {
    return this.request(researcherEndpoints.updateStudy.path.replace(":id", String(id)), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async deleteStudy(id: number): Promise<void> {
    await this.request(researcherEndpoints.deleteStudy.path.replace(":id", String(id)), { method: "DELETE" });
  }

  async getStudyUsers(id: number): Promise<StudyUser[]> {
    return this.request(researcherEndpoints.getStudyUsers.path.replace(":id", String(id)));
  }

  async putStudyUsers(id: number, users: StudyUser[]): Promise<void> {
    await this.request(researcherEndpoints.putStudyUsers.path.replace(":id", String(id)), {
      method: "PUT",
      body: JSON.stringify({ users }),
    });
  }

  async listDesignVersions(): Promise<DesignVersionMeta[]> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.listDesignVersions.path.replace(":studyId", String(studyId)));
  }

  async getDesignVersion(id: number): Promise<DesignVersion> {
    const studyId = this.requireStudyId();
    return this.request(
      researcherEndpoints.getDesignVersion.path.replace(":studyId", String(studyId)).replace(":id", String(id)),
    );
  }

  async createDesignVersion(body: DesignWrite): Promise<DesignVersion> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.createDesignVersion.path.replace(":studyId", String(studyId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateDesignVersion(id: number, body: DesignWrite): Promise<DesignVersion> {
    const studyId = this.requireStudyId();
    return this.request(
      researcherEndpoints.updateDesignVersion.path.replace(":studyId", String(studyId)).replace(":id", String(id)),
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async deleteDesignVersion(id: number): Promise<void> {
    const studyId = this.requireStudyId();
    await this.request(
      researcherEndpoints.deleteDesignVersion.path.replace(":studyId", String(studyId)).replace(":id", String(id)),
      { method: "DELETE" },
    );
  }

  async listUnits(): Promise<UnitMeta[]> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.listUnits.path.replace(":studyId", String(studyId)));
  }

  async getUnitFields(): Promise<UnitField[]> {
    return this.request(this.studyPath(researcherEndpoints.getUnitFields.path));
  }

  async putUnitFields(fields: UnitField[]): Promise<UnitField[]> {
    return this.request(this.studyPath(researcherEndpoints.putUnitFields.path), { method: "PUT", body: JSON.stringify({ fields }) });
  }

  async listUnitPage(query: { offset: number; limit: number; group?: string; set?: string }): Promise<UnitPage> {
    const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) });
    if (query.group && query.set) {
      params.set("group", query.group);
      params.set("set", query.set);
    }
    return this.request(`${this.studyPath(researcherEndpoints.listUnitPage.path)}?${params}`);
  }

  async getUnit(id: number): Promise<UnitResponse> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.getUnit.path.replace(":studyId", String(studyId)).replace(":id", String(id)));
  }

  async createUnits(body: UnitsCreateBody): Promise<UnitResponse[]> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.createUnits.path.replace(":studyId", String(studyId)), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteUnit(id: number): Promise<void> {
    const studyId = this.requireStudyId();
    await this.request(researcherEndpoints.deleteUnit.path.replace(":studyId", String(studyId)).replace(":id", String(id)), {
      method: "DELETE",
    });
  }

  async listSetGroups(live = false): Promise<SetGroupResponse[]> {
    return this.request(this.studyPath(researcherEndpoints.listSetGroups.path) + (live ? "?live=true" : ""));
  }

  async putSetGroup(group: string, body: SetGroupWrite): Promise<SetGroupResponse> {
    return this.request(this.studyPath(researcherEndpoints.putSetGroup.path).replace(":group", encodeURIComponent(group)), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async deleteSetGroup(group: string): Promise<void> {
    await this.request(this.studyPath(researcherEndpoints.deleteSetGroup.path).replace(":group", encodeURIComponent(group)), { method: "DELETE" });
  }

  async listCoders(): Promise<CoderProgress[]> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.listCoders.path.replace(":studyId", String(studyId)));
  }

  async deleteCoders(select: DeleteCoders): Promise<DeleteCodersResponse> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.deleteCoders.path.replace(":studyId", String(studyId)), { method: "POST", body: JSON.stringify(select) });
  }

  async postponeDeletion(coderId: number): Promise<void> {
    await this.request(this.studyPath(researcherEndpoints.postponeDeletion.path, coderId), { method: "POST" });
  }

  async listCoderDeletions(): Promise<CoderDeletion[]> {
    return this.request(this.studyPath(researcherEndpoints.listCoderDeletions.path));
  }

  private studyPath(path: string, id?: number): string {
    const withStudy = path.replace(":studyId", String(this.requireStudyId()));
    return id === undefined ? withStudy : withStudy.replace(":id", String(id));
  }

  async listLinks(): Promise<LinkResponse[]> {
    return this.request(this.studyPath(researcherEndpoints.listLinks.path));
  }

  async updateLink(id: number, body: LinkWrite): Promise<LinkResponse> {
    return this.request(this.studyPath(researcherEndpoints.updateLink.path, id), { method: "PUT", body: JSON.stringify(body) });
  }

  async revokeLink(id: number): Promise<LinkResponse> {
    return this.request(this.studyPath(researcherEndpoints.revokeLink.path, id), { method: "POST" });
  }

  async renewLinkSecret(id: number): Promise<LinkResponse> {
    return this.request(this.studyPath(researcherEndpoints.renewLinkSecret.path, id), { method: "POST" });
  }

  async getOverview(): Promise<StudyOverview> {
    return this.request(this.studyPath(researcherEndpoints.getOverview.path));
  }

  async getDeploymentStatus(): Promise<DeploymentStatus> {
    return this.request(this.studyPath(researcherEndpoints.getDeploymentStatus.path));
  }

  async resetAnnotations(body: ResetAnnotations): Promise<{ retired: number }> {
    return this.request(this.studyPath(researcherEndpoints.resetAnnotations.path), { method: "POST", body: JSON.stringify(body) });
  }

  async getDeployment(): Promise<DeploymentResponse | null> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.getDeployment.path.replace(":studyId", String(studyId)));
  }

  async getPendingChanges(): Promise<PendingChanges> {
    return this.request(this.studyPath(researcherEndpoints.getPendingChanges.path));
  }

  async getServerVersion(): Promise<ClientVersion> {
    const { release, commit } = await this.request<ClientVersion>("/health");
    return { release, commit };
  }

  async listDeploymentVersions(): Promise<DeploymentVersion[]> {
    return this.request(this.studyPath(researcherEndpoints.listDeploymentVersions.path));
  }

  async putDeployment(body: DeploymentWrite): Promise<DeploymentResponse> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.putDeployment.path.replace(":studyId", String(studyId)), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async createPreview(): Promise<PreviewSession> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.createPreview.path.replace(":studyId", String(studyId)), { method: "POST" });
  }
}
