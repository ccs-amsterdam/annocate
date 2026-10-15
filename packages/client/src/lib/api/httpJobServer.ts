import type { CoderSessionScope } from "../session/coderSession";
import {
  endpoints,
  type SessionResponse,
  type CoderUnitResponse,
  type TransferResponse,
  type VariableValue,
} from "@annotinder/contracts";

/** A failed job server request, with the server's machine-readable `code` if any (contracts `CoderErrorCode`). */
export class JobServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function toError(res: Response, path: string): Promise<JobServerError> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: unknown; code?: unknown };
    const message = typeof body.error === "string" ? body.error : text;
    return new JobServerError(message, res.status, typeof body.code === "string" ? body.code : undefined);
  } catch {
    return new JobServerError(`Request to ${path} failed (${res.status}): ${text}`, res.status);
  }
}

/**
 * Client-side abstraction over "however we talk to a job's backend" (docs/client.md §2). `HttpJobServer` is the only implementation for now
 * (talking to a job server, packages/job-server); a future
 * design/offline variant (for Storybook-like isolated component dev) can
 * implement the same interface without a network round-trip.
 */
export interface JobServer {
  getSession(): Promise<SessionResponse>;
  /** Next unit for a unit_loop; which unit is decided by the job server. `null` = the coder is done with the loop. */
  getNextUnit(loop: string): Promise<CoderUnitResponse | null>;
  /** A unit the coder already has in a loop (e.g. finished in an earlier visit), to navigate back to it. */
  getLoopUnit(loop: string, unitId: number): Promise<CoderUnitResponse>;
  /** A finished unit: answers to every question of the loop (`skip` for hidden ones). */
  postUnitVariables(unitId: number, variables: Record<string, VariableValue>, loop?: string): Promise<void>;
  postCoderVariables(variables: Record<string, VariableValue>): Promise<void>;
  /** A one-time token to continue this session on another device (docs/coder-identity.md). */
  createTransfer?(): Promise<TransferResponse>;
}

export interface HttpJobServerConfig {
  /** Base URL of the job's server including the deployment, e.g. "/d/mock.1" (same origin as the client). */
  baseUrl: string;
  /** The invite link: creates the coder on first use, and selects this link's session cookie. */
  inviteSecret?: string;
  /** Participant id from the URL, for invites that take it from there. */
  participantId?: string;
  /**
   * Start a new session although this participant already has one elsewhere.
   * Sent with the first request only: the job server then sets a new cookie.
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
export class HttpJobServer implements JobServer {
  /** Still to be sent: cleared once a request succeeded, so only one new session is made. */
  private newSession: boolean;

  constructor(private config: HttpJobServerConfig) {
    this.newSession = config.newSession ?? false;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...CLIENT_HEADERS,
      ...scopeHeaders(this.config),
    };
    if (this.newSession) headers["x-new-session"] = "1";
    return headers;
  }

  /** Exchanges a transfer token for this device's session cookie (set by the job server). */
  static async redeemTransfer(scope: CoderSessionScope, token: string): Promise<void> {
    const path = endpoints.redeemTransfer.path;
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
    return this.request(endpoints.getSession.path);
  }

  async getNextUnit(loop: string): Promise<CoderUnitResponse | null> {
    return this.request(endpoints.getNextUnit.path.replace(":loop", encodeURIComponent(loop)));
  }

  async getLoopUnit(loop: string, unitId: number): Promise<CoderUnitResponse> {
    return this.request(
      endpoints.getLoopUnit.path.replace(":loop", encodeURIComponent(loop)).replace(":unitId", String(unitId)),
    );
  }

  async postUnitVariables(unitId: number, variables: Record<string, VariableValue>, loop?: string): Promise<void> {
    await this.request(endpoints.postUnitVariables.path, {
      method: "POST",
      body: JSON.stringify({ unitId, loop, variables }),
    });
  }

  async createTransfer(): Promise<TransferResponse> {
    return this.request(endpoints.createTransfer.path, { method: "POST" });
  }

  async postCoderVariables(variables: Record<string, VariableValue>): Promise<void> {
    await this.request(endpoints.postCoderVariables.path, {
      method: "POST",
      body: JSON.stringify({ variables }),
    });
  }
}
