import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeletionRequest, VariableValue } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import type { Store } from "./store.js";
import type { Coder as StoredCoder, CoderAnnotation, CoderWrite, Finished, FinishedRequest, AnnotationWrite, ResolveCoderRequest, ResolvedCoder } from "./types.js";

// Researcher previews (`<jobId>.preview`, contracts PreviewSessionSchema):
// the latest codebook and the real units come from the database, but coders
// and answers stay here, in memory. Nothing a preview does is stored, and it
// is gone when the server forgets the deployment.

/** A preview token (the invite secret of a preview): `preview.<jobId>.<expiresAtMs>.<HMAC>`. */
export function previewToken(secret: string, jobId: number, expiresAt: number): string {
  return `preview.${jobId}.${expiresAt}.${sign(secret, jobId, expiresAt)}`;
}

export function verifyPreviewToken(secret: string, jobId: number, token: string, now: number): boolean {
  const match = /^preview\.(\d+)\.(\d+)\.([0-9a-f]{64})$/.exec(token);
  if (!match || Number(match[1]) !== jobId || Number(match[2]) <= now) return false;
  return timingSafeEqual(Buffer.from(sign(secret, jobId, Number(match[2]))), Buffer.from(match[3]));
}

function sign(secret: string, jobId: number, expiresAt: number): string {
  return createHmac("sha256", secret).update(`preview.${jobId}.${expiresAt}`).digest("hex");
}

interface Coder extends StoredCoder {
  created: Date;
}

export class PreviewStore implements Store {
  private coders = new Map<number, Coder>();
  /** Device keys -> coder id: a device's preview session (a new one on "start over"). */
  private devices = new Map<string, number>();
  /** `<unitId>/<coderId>` -> the coder's answers and when they were first written. */
  private annotations = new Map<string, CoderAnnotation>();

  constructor(
    private db: Store,
    /** What preview tokens are signed with. */
    private secret: string,
    private jobId: number,
    private now: () => number = () => Date.now(),
  ) {}

  getDeployment: Store["getDeployment"] = () => this.db.getDeployment();
  getUnits: Store["getUnits"] = (ids) => this.db.getUnits(ids);
  /** Previews keep their unit versions in memory, like their answers. */
  private versions = new Map<string, number>();
  unitVersion: Store["unitVersion"] = async (unitId, hash) => {
    const key = `${unitId}/${hash}`;
    if (!this.versions.has(key)) this.versions.set(key, this.versions.size + 1);
    return this.versions.get(key)!;
  };
  /** Preview coders have no invite: they get the units of the first invite that has some. */
  inviteUnitset: Store["inviteUnitset"] = () => this.db.inviteUnitset("first");

  async listCoders(): Promise<StoredCoder[]> {
    return [...this.coders.values()];
  }

  async resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    const knownId = request.newSession ? undefined : this.devices.get(request.coderKey);
    const known = knownId === undefined ? undefined : this.coders.get(knownId);
    if (known) return { coder: known, deviceId: null };
    const valid =
      request.inviteSecret !== undefined &&
      verifyPreviewToken(this.secret, this.jobId, request.inviteSecret, this.now());
    if (!valid) throw new HttpError(401, "This preview link has expired; open the preview again");
    const coder: Coder = {
      coderId: this.coders.size + 1,
      variables: {},
      assignments: {},
      ended: null,
      deletionRequest: null,
      session: {},
      inviteId: null,
      email: null,
      created: new Date(this.now()),
    };
    this.coders.set(coder.coderId, coder);
    this.devices.set(request.coderKey, coder.coderId);
    return { coder, deviceId: null };
  }

  async addDevice(coderId: number, coderKey: string): Promise<number | null> {
    this.devices.set(coderKey, coderId);
    return null;
  }

  /** Previews keep nothing: no limits. */
  async checkAnswers(): Promise<void> {}

  async putCoder(coderId: number, body: CoderWrite): Promise<void> {
    const coder = this.coders.get(coderId);
    if (!coder) throw new HttpError(404, "Coder not found");
    coder.variables = body.variables;
    coder.assignments = body.assignments;
    coder.ended = body.ended;
  }

  async requestDeletion(coderId: number, request: DeletionRequest): Promise<void> {
    const coder = this.coders.get(coderId);
    if (coder) coder.deletionRequest = request;
  }

  async listAnnotations(coderId: number): Promise<CoderAnnotation[]> {
    return [...this.annotations.values()].filter((a) => a.coderId === coderId);
  }

  async putAnnotation(w: AnnotationWrite): Promise<void> {
    const now = new Date(this.now());
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

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    const rows: Finished[] = [];
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
