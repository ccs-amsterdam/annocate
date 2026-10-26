import type { CoderSessionScope } from "../session/coderSession";
import {
  coderEndpoints,
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
  /** A finished unit: answers to every question of the loop (`skip` for hidden ones). */
  postUnitVariables(unitId: number, variables: Record<string, VariableValue>, loop?: string): Promise<void>;
  postCoderVariables(variables: Record<string, VariableValue>): Promise<void>;
  /** A one-time token to continue this session on another device (docs/coder-identity.md). */
  createTransfer?(): Promise<TransferResponse>;
}

export interface HttpCoderApiConfig {
  /** Base URL of the job's server including the deployment, e.g. "/d/amcat.nl/42" (same origin as the client). */
  baseUrl: string;
  /** The invite link: creates the coder on first use, and selects this link's session cookie. */
  inviteSecret?: string;
  /** Participant id from the URL, for invites that take it from there. */
  participantId?: string;
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

function scopeHeaders(scope: { inviteSecret?: string; participantId?: string }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (scope.inviteSecret) headers["x-invite-secret"] = scope.inviteSecret;
  if (scope.participantId) headers["x-participant-id"] = scope.participantId;
  return headers;
}

/** Talks to a real server implementing the `@annotinder/contracts` endpoint registry over HTTP. */
export class HttpCoderApi implements CoderApi {
  /** Still to be sent: cleared once a request succeeded, so only one new session is made. */
  private newSession: boolean;

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
    return this.request(coderEndpoints.getSession.path);
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

  async postUnitVariables(unitId: number, variables: Record<string, VariableValue>, loop?: string): Promise<void> {
    await this.request(coderEndpoints.postUnitVariables.path, {
      method: "POST",
      body: JSON.stringify({ unitId, loop, variables }),
    });
  }

  async createTransfer(): Promise<TransferResponse> {
    return this.request(coderEndpoints.createTransfer.path, { method: "POST" });
  }

  async postCoderVariables(variables: Record<string, VariableValue>): Promise<void> {
    await this.request(coderEndpoints.postCoderVariables.path, {
      method: "POST",
      body: JSON.stringify({ variables }),
    });
  }
}
