import {
  endpoints,
  type SessionResponse,
  type CoderUnitResponse,
  type VariableValue,
} from "@annotinder/contracts";

/**
 * Client-side abstraction over "however we talk to a job's backend" (design
 * plan §5/3.1). `HttpJobServer` is the only implementation for now (talking
 * to a real HTTP server, e.g. packages/mock-server); a future
 * design/offline variant (for Storybook-like isolated component dev) can
 * implement the same interface without a network round-trip.
 */
export interface JobServer {
  getSession(): Promise<SessionResponse>;
  getNextUnit(unitset: string): Promise<CoderUnitResponse | null>;
  postUnitVariables(unitId: number, variables: Record<string, VariableValue>): Promise<void>;
  postCoderVariables(variables: Record<string, VariableValue>): Promise<void>;
}

export interface HttpJobServerConfig {
  /** Base URL of the job's server, e.g. "http://localhost:8787". */
  baseUrl: string;
  /** A stable, client-generated key identifying this coder across requests/sessions (see mock-server's dev-mode auth). */
  coderKey: string;
  /** Only needed the first time this coderKey is used, to establish the coder via an invite link. */
  inviteSecret?: string;
}

/** Talks to a real server implementing the `@annotinder/contracts` endpoint registry over HTTP. */
export class HttpJobServer implements JobServer {
  constructor(private config: HttpJobServerConfig) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-coder-key": this.config.coderKey,
    };
    if (this.config.inviteSecret) headers["x-invite-secret"] = this.config.inviteSecret;
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

  async getSession(): Promise<SessionResponse> {
    return this.request(endpoints.getSession.path);
  }

  async getNextUnit(unitset: string): Promise<CoderUnitResponse | null> {
    return this.request(endpoints.getNextUnit.path.replace(":setname", encodeURIComponent(unitset)));
  }

  async postUnitVariables(unitId: number, variables: Record<string, VariableValue>): Promise<void> {
    await this.request(endpoints.postUnitVariables.path, {
      method: "POST",
      body: JSON.stringify({ unitId, variables }),
    });
  }

  async postCoderVariables(variables: Record<string, VariableValue>): Promise<void> {
    await this.request(endpoints.postCoderVariables.path, {
      method: "POST",
      body: JSON.stringify({ variables }),
    });
  }
}
