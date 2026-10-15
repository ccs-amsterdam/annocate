import type { z } from "zod";
import {
  backendEndpoints,
  BackendAnnotationSchema,
  BackendCoderSchema,
  BackendUnitSchema,
  DeploymentSpecSchema,
  type BackendAnnotation,
  type BackendCoder,
  type BackendCoderWrite,
  type BackendUnit,
  type DeploymentSpec,
  type ResolveCoderRequest,
  type VariableValue,
} from "@annotinder/contracts";

/** An error that maps directly onto an HTTP response for the coder: `{ error, code? }`. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 502 | 503,
    message: string,
    /** Machine-readable code the client handles specially (contracts `CoderErrorCode`). */
    readonly code?: string,
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
      // 401/404/409 are meaningful to the coder (bad invite, unit removed, participant
      // already has a session): pass on the db server's message and code. Anything
      // else is a db server failure.
      if (res.status === 401 || res.status === 404 || res.status === 409) {
        const body = parseErrorBody(text);
        throw new HttpError(res.status, body?.error ?? text, body?.code);
      }
      throw new HttpError(502, `Db server ${init.method ?? "GET"} ${path} failed (${res.status}): ${text}`);
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

  listCoders(): Promise<BackendCoder[]> {
    return this.request(backendEndpoints.listCoders.path, BackendCoderSchema.array());
  }

  resolveCoder(request: ResolveCoderRequest): Promise<BackendCoder> {
    return this.request(backendEndpoints.resolveCoder.path, BackendCoderSchema, { method: "POST", body: request });
  }

  async putCoder(coderId: number, body: BackendCoderWrite): Promise<void> {
    await this.request(backendEndpoints.putCoder.path, null, { method: "PUT", body, params: { coderId } });
  }

  listAnnotations(): Promise<BackendAnnotation[]> {
    return this.request(backendEndpoints.listAnnotations.path, BackendAnnotationSchema.array());
  }

  async putAnnotation(
    unitId: number,
    coderId: number,
    variables: Record<string, VariableValue>,
    codebookId?: number,
  ): Promise<void> {
    await this.request(backendEndpoints.putAnnotation.path, null, {
      method: "PUT",
      body: { variables, codebookId },
      params: { unitId, coderId },
    });
  }
}

function parseErrorBody(text: string): { error?: string; code?: string } | null {
  try {
    const body = JSON.parse(text) as { error?: unknown; code?: unknown };
    return {
      error: typeof body.error === "string" ? body.error : undefined,
      code: typeof body.code === "string" ? body.code : undefined,
    };
  } catch {
    return null;
  }
}
