import type { CoderSessionScope } from "../session/coderSession";
import {
  type AnswerTiming,
  coderEndpoints,
  type EndSessionResponse,
  type EndUnit,
  type SessionResponse,
  type CoderUnitResponse,
  type TransferResponse,
  type VariableValue,
} from "@annotinder/contracts";

/** A failed server request, with the server's machine-readable `code` if any (contracts `CoderErrorCode`). */
export class CoderApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function toError(res: Response, path: string): Promise<CoderApiError> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: unknown; code?: unknown };
    const message = typeof body.error === "string" ? body.error : text;
    return new CoderApiError(message, res.status, typeof body.code === "string" ? body.code : undefined);
  } catch {
    return new CoderApiError(`Request to ${path} failed (${res.status}): ${text}`, res.status);
  }
}

/** The branch of a unit loop's `units` the client chose for the coder, and its unitset names. */
export interface BranchChoice {
  branch: number;
  unitsets: string[];
}

/**
 * Client-side abstraction over "however we talk to a job's backend" (docs/client.md §2). `HttpCoderApi` is the only implementation for now
 * (talking to the server's coder API, packages/server); a future
 * design/offline variant (for Storybook-like isolated component dev) can
 * implement the same interface without a network round-trip.
 */
export interface CoderApi {
  getSession(): Promise<SessionResponse>;
  /**
   * Next unit for a unit_loop; which unit is decided by the server. `null` = the coder is done with the loop.
   * `branch`: the branch of the loop the client chose, with its filled-in unitset names (contracts NextUnitQuerySchema).
   */
  getNextUnit(loop: string, branch?: BranchChoice): Promise<CoderUnitResponse | null>;
  /** A unit the coder already has in a loop (e.g. finished in an earlier visit), to navigate back to it. */
  getLoopUnit(loop: string, unitId: number): Promise<CoderUnitResponse>;
  /** A finished unit: answers to every question of the loop (`skip` for hidden ones), with how long each took. */
  postUnitVariables(unitId: number, variables: Record<string, VariableValue>, loop?: string, timings?: Record<string, AnswerTiming>): Promise<void>;
  /** The coder-level answers, with how long the questions visited since the last post took. */
  postCoderVariables(variables: Record<string, VariableValue>, timings?: Record<string, AnswerTiming>): Promise<void>;
  /** The coder reached an `end` item: the session is over (screened out or complete). */
  /** The coder reached an `end` item (`unit`: the unit an end inside a unit loop was reached on), or without one finished the job. */
  endSession(item?: string, unit?: EndUnit): Promise<EndSessionResponse>;
  /** Goes back after finishing, while the server allows it (`reopen`). */
  reopenSession(): Promise<void>;
  /** The coder quits (the session ends, if it hadn't); with `requestDeletion` they ask for their answers to be deleted. */
  quitSession(requestDeletion: boolean): Promise<void>;
  /** A one-time token to continue this session on another device (docs/coder-identity.md). */
  createTransfer?(): Promise<TransferResponse>;
}

export interface HttpCoderApiConfig {
  /** Base URL of the job's server including the deployment, e.g. "/d/amcat.nl/42" (same origin as the client). */
  baseUrl: string;
  /** The invite link: creates the coder on first use, and selects this link's session cookie. */
  inviteSecret?: string;
  /**
   * The page's other query parameters, for the codebook's `url_param` auto
   * variables. The server stores the ones it needs when the coder starts.
   */
  urlParams?: Record<string, string>;
  /**
   * Start a new session although this participant already has one elsewhere.
   * Sent with the first request only: the server then sets a new cookie.
   */
  newSession?: boolean;
}

/** Required on every coder API request: cross-site forms can't send it (CSRF). */
const CLIENT_HEADERS = { "x-annotinder": "1" };

function scopeHeaders(scope: { inviteSecret?: string }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (scope.inviteSecret) headers["x-invite-secret"] = scope.inviteSecret;
  return headers;
}

/** Talks to a real server implementing the `@annotinder/contracts` endpoint registry over HTTP. */
export class HttpCoderApi implements CoderApi {
  /** Still to be sent: cleared once a request succeeded, so only one new session is made. */
  private newSession: boolean;
  /** The deployment version of the loaded session, sent with every request (`codebook_changed` after a publish). */
  private version: number | null = null;

  constructor(private config: HttpCoderApiConfig) {
    this.newSession = config.newSession ?? false;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...CLIENT_HEADERS,
      ...scopeHeaders(this.config),
    };
    if (this.newSession) headers["x-new-session"] = "1";
    if (this.version !== null) headers["x-annotinder-version"] = String(this.version);
    const query = new URLSearchParams(this.config.urlParams ?? {}).toString();
    if (query) headers["x-url-params"] = query.slice(0, 2000);
    return headers;
  }

  /** Exchanges a transfer token for this device's session cookie (set by the server). */
  static async redeemTransfer(scope: CoderSessionScope, token: string): Promise<void> {
    const path = coderEndpoints.redeemTransfer.path;
    const res = await fetch(`${scope.baseUrl}${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...CLIENT_HEADERS, ...scopeHeaders(scope) },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw await toError(res, path);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: this.headers(),
    });
    if (!res.ok) throw await toError(res, path);
    this.newSession = false;
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async getSession(): Promise<SessionResponse> {
    const session = await this.request<SessionResponse>(coderEndpoints.getSession.path);
    this.version = session.version;
    return session;
  }

  async getNextUnit(loop: string, branch?: BranchChoice): Promise<CoderUnitResponse | null> {
    const query = new URLSearchParams();
    if (branch) {
      query.set("branch", String(branch.branch));
      for (const name of branch.unitsets) query.append("unitsets", name);
    }
    const path = coderEndpoints.getNextUnit.path.replace(":loop", encodeURIComponent(loop));
    return this.request(branch ? `${path}?${query}` : path);
  }

  async getLoopUnit(loop: string, unitId: number): Promise<CoderUnitResponse> {
    return this.request(
      coderEndpoints.getLoopUnit.path.replace(":loop", encodeURIComponent(loop)).replace(":unitId", String(unitId)),
    );
  }

  async postUnitVariables(
    unitId: number,
    variables: Record<string, VariableValue>,
    loop?: string,
    timings?: Record<string, AnswerTiming>,
  ): Promise<void> {
    await this.request(coderEndpoints.postUnitVariables.path, {
      method: "POST",
      body: JSON.stringify({ unitId, loop, variables, timings }),
    });
  }

  async createTransfer(): Promise<TransferResponse> {
    return this.request(coderEndpoints.createTransfer.path, { method: "POST" });
  }

  async postCoderVariables(variables: Record<string, VariableValue>, timings?: Record<string, AnswerTiming>): Promise<void> {
    await this.request(coderEndpoints.postCoderVariables.path, {
      method: "POST",
      body: JSON.stringify({ variables, timings }),
    });
  }

  async endSession(item?: string, unit?: EndUnit): Promise<EndSessionResponse> {
    return this.request(coderEndpoints.endSession.path, { method: "POST", body: JSON.stringify({ item, unit }) });
  }

  async reopenSession(): Promise<void> {
    await this.request(coderEndpoints.reopenSession.path, { method: "POST" });
  }

  async quitSession(requestDeletion: boolean): Promise<void> {
    await this.request(coderEndpoints.quitSession.path, { method: "POST", body: JSON.stringify({ requestDeletion }) });
  }
}
