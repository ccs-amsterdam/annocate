import {
  researcherEndpoints,
  type StudyWrite,
  type LogoutResponse,
  type ExampleSummary,
  type StudyFromExample,
  type RecipeInput,
  type StudyResponse,
  type StudyUser,
  type StudyUserResponse,
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
  type ResultsAgreement,
  type ResultsAnswers,
  type ResultsCoders,
  type CoderUnits,
  type ResultsExport,
  type ResultsUnit,
  type ResultsUnits,
  type CoderProgress,
  type CoderList,
  type CoderPatch,
  type CoderResponse,
  type CodersCreate,
  type CodersCreated,
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
  type ApiKeyResponse,
  type ApiKeyCreated,
  type AnnotationPage,
  type UnitVersionPage,
  type UnitVersionsQuery,
  type AnnotationsQuery,
  type AuthOptions,
  type AccountDeletion,
} from "@annotinder/contracts";

/**
 * A failed researcher API request, with its HTTP status (401: not logged in,
 * 404: no such study or no role in it, 403: a role too low for this).
 */
export class ResearcherApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The parsed JSON error body (`{ error, code?, ... }`), if there was one. */
    readonly body?: unknown,
  ) {
    super(message);
  }

  /**
   * The server's message (`error` of the body), else the whole message. An
   * internal error (500) comes with the request's id, to report it with.
   */
  get reason(): string {
    const { error, requestId } = (this.body ?? {}) as { error?: unknown; requestId?: unknown };
    if (typeof error !== "string") return this.message;
    return this.status === 500 && typeof requestId === "string" ? `${error} (request id ${requestId})` : error;
  }

  /** The machine-readable `code` of the error body, e.g. `design_conflict`. */
  get code(): string | undefined {
    const code = (this.body as { code?: unknown } | undefined)?.code;
    return typeof code === "string" ? code : undefined;
  }
}

export interface LoginUrlOptions {
  stepUp?: boolean;
  /** Log in at the provider again, whatever session the browser has there (after setting up a second factor). */
  fresh?: boolean;
  previous?: boolean;
  link?: boolean;
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
  /**
   * Ends the login session (session cookie). Returns where the browser goes
   * to end the login provider's session too, or null (contracts `LogoutResponse`).
   */
  logout(): Promise<string | null>;
  /**
   * Where the browser goes to log in; it comes back to `returnTo` (a path on
   * this origin). `stepUp`: a login for a sensitive action, with a fresh
   * second factor (docs/security.md "Step-up"). While the server moves to
   * another login provider (docs/accounts.md "Changing providers"):
   * `previous`, log in with the old one; `link`, add a login at the new
   * one to the logged-in account.
   */
  loginUrl(returnTo: string, options?: LoginUrlOptions): string;
  /** Who the client is authenticated as. */
  getMe(): Promise<MeResponse>;
  listApiKeys(): Promise<ApiKeyResponse[]>;
  /** A new API key: `key` is returned only this once. */
  createApiKey(label: string): Promise<ApiKeyCreated>;
  revokeApiKey(id: number): Promise<ApiKeyResponse>;
  /** What deleting one's account would delete, and what keeps it from being deleted. */
  getAccountDeletion(): Promise<AccountDeletion>;
  /** Deletes one's account for good and logs out; `confirm` is its email address. Sensitive. */
  deleteAccount(confirm: string): Promise<void>;

  listStudies(): Promise<StudyResponse[]>;
  getStudy(id?: number): Promise<StudyResponse | null>;
  createStudy(body: StudyWrite): Promise<StudyResponse>;
  /** The example studies AnnoTinder ships (docs/examples.md). */
  listExamples(): Promise<ExampleSummary[]>;
  /** A new study from an example: units, a deployed design version, a link and example answers. */
  createStudyFromExample(body: StudyFromExample): Promise<StudyResponse>;
  /** A new study from a recipe (a design file, contracts `recipe.ts`): units, their columns with a role, a design (a draft unless `publish`; deploying makes its links). */
  createStudyFromRecipe(body: RecipeInput): Promise<StudyResponse>;
  /** The study export (coders and answers included), with its file name. Sensitive: may ask for a step-up login. */
  exportStudy(): Promise<{ file: string; bytes: Blob }>;
  /** A new study from a study export's bytes; `coders: false` leaves out coders and their answers. */
  importStudy(bytes: Uint8Array, options?: { name?: string; coders?: boolean }): Promise<StudyResponse>;
  updateStudy(id: number, body: StudyWrite): Promise<StudyResponse>;
  /** Deletes a study with all its data for good; `confirm` is its name. Sensitive. */
  deleteStudy(id: number, confirm: string): Promise<void>;
  getStudyUsers(id: number): Promise<StudyUserResponse[]>;
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
  /** A page of units with data: all units, or one set's (a value of a column with a role) in its order. */
  listUnitPage(query: { offset: number; limit: number; column?: string; set?: string }): Promise<UnitPage>;
  getUnit(id: number): Promise<UnitResponse>;
  createUnits(body: UnitsCreateBody): Promise<UnitResponse[]>;
  deleteUnit(id: number): Promise<void>;

  /** The columns with a role (coder_set, condition_set, part_set, test_set), each with its sets. */
  listSetGroups(live?: boolean): Promise<SetGroupResponse[]>;
  /** Makes or replaces a column with a role; deployed, the links follow (a link per coder of coder_set). */
  putSetGroup(group: string, body: SetGroupWrite): Promise<SetGroupResponse>;
  /** Refused (409) while the design uses the column. */
  deleteSetGroup(group: string): Promise<void>;

  /** The study's coders (expert and crowd) with their units, and the units no expert coder has. */
  listCoders(): Promise<CoderList>;
  /** Makes expert coders; refused as a whole when an id or address is taken. */
  createCoders(body: CodersCreate): Promise<CodersCreated>;
  /** Sets or clears an expert coder's email address. */
  updateCoder(coder: string, body: CoderPatch): Promise<CoderResponse>;
  /** The coder sessions with their progress. */
  listSessions(): Promise<CoderProgress[]>;
  /** Deletes sessions and all their answers for good, by session id, coder id or email; by coder id the coder too (ADMIN). */
  deleteCoders(select: DeleteCoders): Promise<DeleteCodersResponse>;
  /** Deletes later: the coder's deletion request stays, but is no longer brought up (ADMIN). */
  postponeDeletion(sessionId: number): Promise<void>;
  /** The study's deletion log, newest first. */
  listCoderDeletions(): Promise<CoderDeletion[]>;
  /** The links (made from the deployed design version), active ones first. */
  listLinks(): Promise<LinkResponse[]>;
  /** A link's access settings: label, login, emails, max uses, coder id. */
  /** No new coders from this link; coders who started keep working. */
  revokeLink(id: number): Promise<LinkResponse>;
  /** A revoked link takes new coders again. */
  reopenLink(id: number): Promise<LinkResponse>;
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

  /** A preview session of the latest design version, run in memory. */
  createPreview(): Promise<PreviewSession>;

  /** One page of annotations; pass `next` as `after` for the following page. */
  listAnnotations(query?: AnnotationsQuery): Promise<AnnotationPage>;
  /** Units as coders saw them, a page at a time. */
  listUnitVersions(query?: UnitVersionsQuery): Promise<UnitVersionPage>;
  /** The devices coders used, for the export. */
  listDevices(): Promise<Device[]>;
  getResultsAnswers(): Promise<ResultsAnswers>;
  getResultsAgreement(): Promise<ResultsAgreement>;
  listResultUnits(): Promise<ResultsUnits>;
  getResultUnit(unitId: number): Promise<ResultsUnit>;
  listResultCoders(): Promise<ResultsCoders>;
  /** Per coder id, the units they were shown or answered. */
  listCoderUnits(): Promise<CoderUnits>;
  /** A link to the study's raw export (written now, or reused if nothing changed). */
  exportResults(): Promise<ResultsExport>;
  /** The file behind an export link. */
  downloadExport(url: string): Promise<Uint8Array>;
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
  /** Development auth headers instead of a key; only accepted by a server in development mode (AUTH_DEV_MODE=1). */
  devRole?: "ADMIN" | "WRITE" | "READ";
  devEmail?: string;
  /** Optional study ID to scope per-study requests (design versions, units, etc.). */
  studyId?: number;
}

/** Talks to a real server implementing the `@annotinder/contracts` admin endpoints over HTTP. */
export class HttpResearcherApi implements ResearcherApi {
  constructor(
    private config: HttpResearcherApiConfig,
    /** Told when the login session ended: shared with the clients made from this one (`forStudy`). */
    private loginEndedListeners = new Set<() => void>(),
  ) {}

  get studyId(): number | undefined {
    return this.config.studyId;
  }

  forStudy(studyId: number): ResearcherApi {
    return new HttpResearcherApi({ ...this.config, studyId }, this.loginEndedListeners);
  }

  /**
   * Calls `listener` whenever the server refuses a request with the session
   * cookie (401): the login session ended. Returns how to stop.
   */
  onLoginEnded(listener: () => void): () => void {
    this.loginEndedListeners.add(listener);
    return () => this.loginEndedListeners.delete(listener);
  }

  /** The user is at work in the client: their login session goes on (docs/security.md "The session"). */
  async reportActivity(): Promise<void> {
    await this.request(researcherEndpoints.reportActivity.path, { method: "POST" });
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

  /**
   * A whole list (contracts paging.ts): the items under `key` of every page,
   * following `next` until the server has no more.
   */
  private async listAll<T>(path: string, key: string): Promise<T[]> {
    const items: T[] = [];
    for (let after: number | undefined; ;) {
      const page = await this.request<Record<string, unknown>>(after === undefined ? path : `${path}?after=${after}`);
      items.push(...((page[key] as T[] | undefined) ?? []));
      if (typeof page.next !== "number") return items;
      after = page.next;
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.send(path, init);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /** A request whose response is ok (else a `ResearcherApiError`), with this client's authentication; `contentType` of the body. */
  private async send(path: string, init?: RequestInit, contentType?: string): Promise<Response> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(contentType ? { "content-type": contentType } : {}) },
      credentials: "same-origin",
    });
    if (!res.ok) {
      const body = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = undefined;
      }
      const error = new ResearcherApiError(res.status, `Request to ${path} failed (${res.status}): ${body}`, parsed);
      if (res.status === 401 && !this.config.apiKey && !this.config.devRole)
        for (const listener of this.loginEndedListeners) listener();
      // A sensitive action needs a recent login (with a second factor, unless the server turned that off): log in again, back to this page (then do it again)
      if (error.code === "step_up_required" && typeof window !== "undefined" && !this.config.devRole) {
        if (
          window.confirm(
            "To do this, confirm it's you: log in again (your login provider may ask for your second factor), then try once more.",
          )
        ) {
          window.location.assign(
            this.loginUrl(window.location.pathname + window.location.search + window.location.hash, { stepUp: true }),
          );
        }
      }
      throw error;
    }
    return res;
  }

  async getAuthOptions(): Promise<AuthOptions> {
    return this.request(researcherEndpoints.getAuthOptions.path);
  }

  async logout(): Promise<string | null> {
    const { redirect } = await this.request<LogoutResponse>(researcherEndpoints.logout.path, { method: "POST" });
    return redirect;
  }

  loginUrl(returnTo: string, options: LoginUrlOptions = {}): string {
    const extra = `${options.stepUp ? "&stepUp=1" : ""}${options.fresh ? "&fresh=1" : ""}${options.previous ? "&provider=previous" : ""}${options.link ? "&link=1" : ""}`;
    return `${this.config.baseUrl}/auth/login?returnTo=${encodeURIComponent(returnTo)}${extra}`;
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

  async getAccountDeletion(): Promise<AccountDeletion> {
    return this.request(researcherEndpoints.getAccountDeletion.path);
  }

  async deleteAccount(confirm: string): Promise<void> {
    await this.request(researcherEndpoints.deleteAccount.path, { method: "DELETE", body: JSON.stringify({ confirm }) });
  }

  async listAnnotations(query: AnnotationsQuery = {}): Promise<AnnotationPage> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value !== undefined) params.set(name, String(value));
    const path = researcherEndpoints.listAnnotations.path.replace(":studyId", String(this.requireStudyId()));
    return this.request(params.size ? `${path}?${params}` : path);
  }

  async listDevices(): Promise<Device[]> {
    return this.listAll(this.studyPath(researcherEndpoints.listDevices.path), "devices");
  }

  async getResultsAnswers(): Promise<ResultsAnswers> {
    return this.request(this.studyPath(researcherEndpoints.getResultsAnswers.path));
  }

  async getResultsAgreement(): Promise<ResultsAgreement> {
    return this.request(this.studyPath(researcherEndpoints.getResultsAgreement.path));
  }

  async listResultUnits(): Promise<ResultsUnits> {
    return this.request(this.studyPath(researcherEndpoints.listResultUnits.path));
  }

  async getResultUnit(unitId: number): Promise<ResultsUnit> {
    return this.request(this.studyPath(researcherEndpoints.getResultUnit.path).replace(":unitId", String(unitId)));
  }

  async listCoderUnits(): Promise<CoderUnits> {
    return this.request(this.studyPath(researcherEndpoints.listCoderUnits.path));
  }

  async listResultCoders(): Promise<ResultsCoders> {
    return this.request(this.studyPath(researcherEndpoints.listResultCoders.path));
  }

  async exportResults(): Promise<ResultsExport> {
    return this.request(this.studyPath(researcherEndpoints.exportResults.path), { method: "POST" });
  }

  async downloadExport(url: string): Promise<Uint8Array> {
    // The link is the key: no login headers (it may point to a storage service)
    const res = await fetch(url);
    if (!res.ok) throw new ResearcherApiError(res.status, `The download failed (${res.status})`, undefined);
    return new Uint8Array(await res.arrayBuffer());
  }

  async listUnitVersions(query: UnitVersionsQuery = {}): Promise<UnitVersionPage> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value !== undefined) params.set(name, String(value));
    const path = researcherEndpoints.listUnitVersions.path.replace(":studyId", String(this.requireStudyId()));
    return this.request(params.size ? `${path}?${params}` : path);
  }

  async listStudies(): Promise<StudyResponse[]> {
    return this.listAll(researcherEndpoints.listStudies.path, "studies");
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
      if (err instanceof ResearcherApiError && err.status === 404) return null;
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
    return this.request(researcherEndpoints.createStudyFromExample.path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async exportStudy(): Promise<{ file: string; bytes: Blob }> {
    const studyId = this.requireStudyId();
    const res = await this.send(researcherEndpoints.exportStudy.path.replace(":id", String(studyId)));
    const file = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "study.annotinder.gz";
    return { file, bytes: await res.blob() };
  }

  async importStudy(bytes: Uint8Array, options: { name?: string; coders?: boolean } = {}): Promise<StudyResponse> {
    const query = new URLSearchParams({
      ...(options.name ? { name: options.name } : {}),
      ...(options.coders === false ? { coders: "false" } : {}),
    });
    const res = await this.send(
      `${researcherEndpoints.importStudy.path}${query.size ? `?${query}` : ""}`,
      { method: "POST", body: bytes as BodyInit },
      "application/octet-stream",
    );
    return res.json() as Promise<StudyResponse>;
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

  async deleteStudy(id: number, confirm: string): Promise<void> {
    await this.request(researcherEndpoints.deleteStudy.path.replace(":id", String(id)), {
      method: "DELETE",
      body: JSON.stringify({ confirm }),
    });
  }

  async getStudyUsers(id: number): Promise<StudyUserResponse[]> {
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
    return this.listAll(researcherEndpoints.listDesignVersions.path.replace(":studyId", String(studyId)), "versions");
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
    return this.listAll(researcherEndpoints.listUnits.path.replace(":studyId", String(studyId)), "units");
  }

  async getUnitFields(): Promise<UnitField[]> {
    return this.request(this.studyPath(researcherEndpoints.getUnitFields.path));
  }

  async putUnitFields(fields: UnitField[]): Promise<UnitField[]> {
    return this.request(this.studyPath(researcherEndpoints.putUnitFields.path), {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  async listUnitPage(query: { offset: number; limit: number; column?: string; set?: string }): Promise<UnitPage> {
    const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) });
    if (query.column && query.set) {
      params.set("column", query.column);
      params.set("set", query.set);
    }
    return this.request(`${this.studyPath(researcherEndpoints.listUnitPage.path)}?${params}`);
  }

  async getUnit(id: number): Promise<UnitResponse> {
    const studyId = this.requireStudyId();
    return this.request(
      researcherEndpoints.getUnit.path.replace(":studyId", String(studyId)).replace(":id", String(id)),
    );
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
    await this.request(
      researcherEndpoints.deleteUnit.path.replace(":studyId", String(studyId)).replace(":id", String(id)),
      {
        method: "DELETE",
      },
    );
  }

  async listSetGroups(live = false): Promise<SetGroupResponse[]> {
    return this.request(this.studyPath(researcherEndpoints.listSetGroups.path) + (live ? "?live=true" : ""));
  }

  async putSetGroup(group: string, body: SetGroupWrite): Promise<SetGroupResponse> {
    return this.request(
      this.studyPath(researcherEndpoints.putSetGroup.path).replace(":group", encodeURIComponent(group)),
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async deleteSetGroup(group: string): Promise<void> {
    await this.request(
      this.studyPath(researcherEndpoints.deleteSetGroup.path).replace(":group", encodeURIComponent(group)),
      { method: "DELETE" },
    );
  }

  /** Every page of the coders; the units without a coder are the same on each, so the first page's. */
  async listCoders(): Promise<CoderList> {
    const path = this.studyPath(researcherEndpoints.listCoders.path);
    const first = await this.request<CoderList>(path);
    const coders = [...first.coders];
    for (let next = first.next; next !== undefined;) {
      const page = await this.request<CoderList>(`${path}?after=${next}`);
      coders.push(...page.coders);
      next = page.next;
    }
    return { coders, unassigned: first.unassigned };
  }

  async createCoders(body: CodersCreate): Promise<CodersCreated> {
    return this.request(this.studyPath(researcherEndpoints.createCoders.path), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateCoder(coder: string, body: CoderPatch): Promise<CoderResponse> {
    return this.request(
      this.studyPath(researcherEndpoints.updateCoder.path).replace(":coder", encodeURIComponent(coder)),
      { method: "PATCH", body: JSON.stringify(body) },
    );
  }

  async listSessions(): Promise<CoderProgress[]> {
    return this.listAll(this.studyPath(researcherEndpoints.listSessions.path), "sessions");
  }

  async deleteCoders(select: DeleteCoders): Promise<DeleteCodersResponse> {
    const studyId = this.requireStudyId();
    return this.request(researcherEndpoints.deleteCoders.path.replace(":studyId", String(studyId)), {
      method: "POST",
      body: JSON.stringify(select),
    });
  }

  async postponeDeletion(sessionId: number): Promise<void> {
    await this.request(this.studyPath(researcherEndpoints.postponeDeletion.path, sessionId), { method: "POST" });
  }

  async listCoderDeletions(): Promise<CoderDeletion[]> {
    return this.request(this.studyPath(researcherEndpoints.listCoderDeletions.path));
  }

  private studyPath(path: string, id?: number): string {
    const withStudy = path.replace(":studyId", String(this.requireStudyId()));
    return id === undefined ? withStudy : withStudy.replace(":id", String(id));
  }

  async listLinks(): Promise<LinkResponse[]> {
    return this.listAll(this.studyPath(researcherEndpoints.listLinks.path), "links");
  }

  async revokeLink(id: number): Promise<LinkResponse> {
    return this.request(this.studyPath(researcherEndpoints.revokeLink.path, id), { method: "POST" });
  }

  async reopenLink(id: number): Promise<LinkResponse> {
    return this.request(this.studyPath(researcherEndpoints.reopenLink.path, id), { method: "POST" });
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
    return this.request(this.studyPath(researcherEndpoints.resetAnnotations.path), {
      method: "POST",
      body: JSON.stringify(body),
    });
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
    return this.request(researcherEndpoints.createPreview.path.replace(":studyId", String(studyId)), {
      method: "POST",
    });
  }
}
