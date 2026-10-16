import type {
  BackendAnnotation,
  BackendAnnotationBatchResult,
  BackendAnnotationWrite,
  BackendCoder,
  BackendCoderWrite,
  BackendFinished,
  FinishedRequest,
  ResolveCoderRequest,
  VariableValue,
} from "@annotinder/contracts";
import { HttpError, type Backend, type BackendClient } from "./backend.js";
import { hmac, timingSafeEqual } from "./jobTokens.js";

// Researcher previews (`<backend>.<jobId>.preview`, contracts
// PreviewSessionSchema): the latest codebook and the real units come from the
// db server, but coders and answers stay here, in memory. Nothing a preview
// does reaches the db server, and it is gone when the job server forgets the
// deployment.

/** Checks a preview token (the invite secret of a preview): made by the db server with the job's call key. */
export async function verifyPreviewToken(callKey: string, jobId: number, token: string, now: number): Promise<boolean> {
  const match = /^preview\.(\d+)\.(\d+)\.([0-9a-f]{64})$/.exec(token);
  if (!match || Number(match[1]) !== jobId || Number(match[2]) <= now) return false;
  const expected = await hmac(callKey, `preview.${match[1]}.${match[2]}`);
  return timingSafeEqual(Array.from(expected, (b) => b.toString(16).padStart(2, "0")).join(""), match[3]);
}

interface Coder extends BackendCoder {
  created: Date;
}

export class PreviewBackend implements Backend {
  private coders = new Map<string, Coder>();
  /** `<unitId>/<coderId>` -> the coder's answers and when they were first written. */
  private annotations = new Map<string, BackendAnnotation>();

  constructor(
    private db: BackendClient,
    /** The job's call key, which the db server signs preview tokens with. */
    private callKey: () => Promise<string>,
    private jobId: number,
    private now: () => number = () => Date.now(),
  ) {}

  getDeployment: Backend["getDeployment"] = () => this.db.getDeployment();
  getUnits: Backend["getUnits"] = (ids) => this.db.getUnits(ids);

  async listCoders(): Promise<BackendCoder[]> {
    return [...this.coders.values()];
  }

  async resolveCoder(request: ResolveCoderRequest): Promise<BackendCoder> {
    const known = this.coders.get(request.coderKey);
    if (known) return known;
    const valid =
      request.inviteSecret !== undefined &&
      (await verifyPreviewToken(await this.callKey(), this.jobId, request.inviteSecret, this.now()));
    if (!valid) throw new HttpError(401, "This preview link has expired; open the preview again");
    const coder: Coder = { coderId: this.coders.size + 1, variables: {}, assignments: {}, created: new Date(this.now()) };
    this.coders.set(request.coderKey, coder);
    return coder;
  }

  async putCoder(coderId: number, body: BackendCoderWrite): Promise<void> {
    const coder = [...this.coders.values()].find((c) => c.coderId === coderId);
    if (!coder) throw new HttpError(404, "Coder not found");
    coder.variables = body.variables;
    coder.assignments = body.assignments;
  }

  async listAnnotations(coderId: number): Promise<BackendAnnotation[]> {
    return [...this.annotations.values()].filter((a) => a.coderId === coderId);
  }

  async putAnnotations(writes: BackendAnnotationWrite[]): Promise<BackendAnnotationBatchResult> {
    const now = new Date(this.now());
    for (const w of writes) {
      const key = `${w.unitId}/${w.coderId}`;
      const existing = this.annotations.get(key);
      this.annotations.set(key, {
        unitId: w.unitId,
        coderId: w.coderId,
        variables: { ...existing?.variables, ...w.variables },
        created: existing?.created ?? now,
        updated: now,
      });
    }
    return { rejected: [] };
  }

  async listFinished(request: FinishedRequest): Promise<BackendFinished[]> {
    const rows: BackendFinished[] = [];
    for (const group of request.loops) {
      const pick = (variables: Record<string, VariableValue>) =>
        group.values?.length ? { values: Object.fromEntries(group.values.filter((v) => v in variables).map((v) => [v, variables[v]])) } : {};
      if (group.level === "coder") {
        for (const c of this.coders.values()) {
          if (request.coderId !== undefined && c.coderId !== request.coderId) continue;
          if (group.variables.every((v) => v in c.variables)) {
            rows.push({ loop: group.loop, unitId: null, coderId: c.coderId, created: c.created, ...pick(c.variables) });
          }
        }
        continue;
      }
      for (const a of this.annotations.values()) {
        if (request.coderId !== undefined && a.coderId !== request.coderId) continue;
        if (group.variables.every((v) => v in a.variables)) {
          rows.push({ loop: group.loop, unitId: a.unitId, coderId: a.coderId, created: a.created, ...pick(a.variables) });
        }
      }
    }
    return rows.sort((a, b) => a.created.getTime() - b.created.getTime());
  }
}
