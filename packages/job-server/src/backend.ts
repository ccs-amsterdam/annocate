import type { z } from "zod";
import {
  backendEndpoints,
  BackendAnnotationsResponseSchema,
  BackendUnitSchema,
  DeploymentSpecSchema,
  ResolveCoderResponseSchema,
  type BackendAnnotation,
  type BackendUnit,
  type DeploymentSpec,
  type ResolveCoderResponse,
  type VariableValue,
} from "@annotinder/contracts";

/** An error that maps directly onto an HTTP response for the coder. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

/** A db server this job server accepts deployments from (see config.ts). */
export interface BackendConfig {
  url: string;
  secret: string;
}

/**
 * Typed client for a db server's backend API (contracts `backendEndpoints`).
 * Responses are validated with the contract schemas, since db servers may be
 * written in any language.
 */
export class BackendClient {
  constructor(
    private config: BackendConfig,
    private jobId: number,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<S extends z.ZodType>(
    path: string,
    schema: S | null,
    init: { method?: string; body?: unknown; params?: Record<string, string | number> } = {},
  ): Promise<z.infer<S>> {
    let url = this.config.url + path.replace(":jobId", String(this.jobId));
    for (const [key, value] of Object.entries(init.params ?? {})) url = url.replace(`:${key}`, String(value));

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${this.config.secret}`, "content-type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (err) {
      throw new HttpError(502, `Db server unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!res.ok) {
      const text = await res.text();
      // 401/404 are meaningful to the coder (bad invite, unit removed); anything else is a db server failure.
      const status = res.status === 401 || res.status === 404 ? res.status : 502;
      throw new HttpError(status, `Db server ${init.method ?? "GET"} ${path} failed (${res.status}): ${text}`);
    }
    if (!schema) return undefined as z.infer<S>;
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new HttpError(502, `Db server returned an invalid response for ${path}`);
    return parsed.data;
  }

  getDeployment(): Promise<DeploymentSpec> {
    return this.request(backendEndpoints.getDeployment.path, DeploymentSpecSchema);
  }

  async getUnits(ids: number[]): Promise<BackendUnit[]> {
    if (ids.length === 0) return [];
    return this.request(`${backendEndpoints.getUnits.path}?ids=${ids.join(",")}`, BackendUnitSchema.array());
  }

  resolveCoder(coderKey: string, inviteSecret?: string): Promise<ResolveCoderResponse> {
    return this.request(backendEndpoints.resolveCoder.path, ResolveCoderResponseSchema, {
      method: "POST",
      body: { coderKey, inviteSecret },
    });
  }

  listAnnotations(): Promise<BackendAnnotation[]> {
    return this.request(backendEndpoints.listAnnotations.path, BackendAnnotationsResponseSchema);
  }

  async putAnnotation(unitId: number, coderId: number, variables: Record<string, VariableValue>): Promise<void> {
    await this.request(backendEndpoints.putAnnotation.path, null, {
      method: "PUT",
      body: { variables },
      params: { unitId, coderId },
    });
  }

  async putCoderVariables(coderId: number, variables: Record<string, VariableValue>): Promise<void> {
    await this.request(backendEndpoints.putCoderVariables.path, null, {
      method: "PUT",
      body: { variables },
      params: { coderId },
    });
  }
}
