import type { z } from "zod";
import {
  annotatorEndpoints,
  AnnotatorAnnotationSchema,
  AnnotatorAnnotationBatchResultSchema,
  AnnotatorCoderSchema,
  AnnotatorFinishedSchema,
  AnnotatorUnitSchema,
  INVALID_JOB_TOKEN,
  DeploymentSpecSchema,
  type AnnotatorAnnotation,
  type AnnotatorAnnotationBatchResult,
  type AnnotatorAnnotationWrite,
  type AnnotatorCoder,
  type AnnotatorCoderWrite,
  type AnnotatorFinished,
  type FinishedRequest,
  type AnnotatorUnit,
  type DeploymentSpec,
  type ResolveCoderRequest,
} from "@annotinder/contracts";
import type { JobTokens } from "./jobTokens.js";

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

/** A db server this job server works for (dbServers.ts). */
export interface DbServerConfig {
  url: string;
}

/** What the runtime needs from a db server: the annotator API, or a preview's in-memory stand-in (preview.ts). */
export type AnnotatorApi = Pick<
  AnnotatorClient,
  | "getDeployment"
  | "getUnits"
  | "listCoders"
  | "resolveCoder"
  | "putCoder"
  | "listFinished"
  | "listAnnotations"
  | "putAnnotations"
>;

/**
 * Typed client for a db server's annotator API (contracts `annotatorEndpoints`).
 * Responses are validated with the contract schemas, since db servers may be
 * written in any language.
 */
export class AnnotatorClient {
  constructor(
    private config: DbServerConfig,
    private jobId: number,
    /** This job's token (plan §13), sent with every call. */
    private tokens: JobTokens,
    // Wrapped: Workers refuse `fetch` called as a method of another object.
    private fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    /** Ask for the preview spec (the latest codebook) instead of the deployed one. */
    private preview = false,
  ) {}

  private async request<S extends z.ZodType>(
    path: string,
    schema: S | null,
    init: { method?: string; body?: unknown; params?: Record<string, string | number> } = {},
  ): Promise<z.infer<S>> {
    let url = this.config.url + path.replace(":jobId", String(this.jobId));
    for (const [key, value] of Object.entries(init.params ?? {})) url = url.replace(`:${key}`, String(value));

    const send = async (token: string) => {
      try {
        return await this.fetchImpl(url, {
          method: init.method ?? "GET",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
      } catch (err) {
        if (err instanceof HttpError) throw err; // e.g. busy (outbound cap)
        throw new HttpError(502, `Db server unreachable: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    const token = await this.tokens.token();
    let res = await send(token);
    let text = res.ok ? "" : await res.text();
    // A rejected token (expired early, db server secret rotated, job rebound):
    // get a new one and try once more. Other 401s (e.g. a bad invite) are the coder's.
    if (res.status === 401 && parseErrorBody(text)?.code === INVALID_JOB_TOKEN) {
      this.tokens.invalidate(token);
      res = await send(await this.tokens.token());
      text = res.ok ? "" : await res.text();
    }

    if (!res.ok) {
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
    const query = this.preview ? "?preview=1" : "";
    return this.request(annotatorEndpoints.getDeployment.path + query, DeploymentSpecSchema);
  }

  async getUnits(ids: number[]): Promise<AnnotatorUnit[]> {
    if (ids.length === 0) return [];
    return this.request(`${annotatorEndpoints.getUnits.path}?ids=${ids.join(",")}`, AnnotatorUnitSchema.array());
  }

  listCoders(): Promise<AnnotatorCoder[]> {
    return this.request(annotatorEndpoints.listCoders.path, AnnotatorCoderSchema.array());
  }

  resolveCoder(request: ResolveCoderRequest): Promise<AnnotatorCoder> {
    return this.request(annotatorEndpoints.resolveCoder.path, AnnotatorCoderSchema, { method: "POST", body: request });
  }

  async putCoder(coderId: number, body: AnnotatorCoderWrite): Promise<void> {
    await this.request(annotatorEndpoints.putCoder.path, null, { method: "PUT", body, params: { coderId } });
  }

  /** Units coders finished per loop (every given variable has a live value). */
  listFinished(request: FinishedRequest): Promise<AnnotatorFinished[]> {
    if (request.loops.length === 0) return Promise.resolve([]);
    return this.request(annotatorEndpoints.listFinished.path, AnnotatorFinishedSchema.array(), {
      method: "POST",
      body: request,
    });
  }

  /** One coder's live annotations, per unit. */
  listAnnotations(coderId: number): Promise<AnnotatorAnnotation[]> {
    return this.request(`${annotatorEndpoints.listAnnotations.path}?coderId=${coderId}`, AnnotatorAnnotationSchema.array());
  }

  /** Applies writes in order; returns the ones the db server can never store. */
  putAnnotations(annotations: AnnotatorAnnotationWrite[]): Promise<AnnotatorAnnotationBatchResult> {
    return this.request(annotatorEndpoints.putAnnotations.path, AnnotatorAnnotationBatchResultSchema, {
      method: "POST",
      body: { annotations },
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
