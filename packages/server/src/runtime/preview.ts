import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeletionRequest, SessionEnd, VariableValue } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import type { Store } from "./store.js";
import type { Coder as StoredCoder, Coding, Lease, CoderValue, CoderAssignments, CoderValuesWrite, Finished, FinishedRequest, AnnotationWrite, ResolveCoderRequest, ResolvedCoder, Transfer } from "./types.js";

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
  private annotations = new Map<string, { unitId: number; coderId: number; variables: Record<string, VariableValue>; created: Date; updated: Date }>();
  /** Coder-level answers, per coder. */
  private values = new Map<number, Record<string, CoderValue>>();

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
    // A copy, as from a database: changes go through the store.
    if (known) return { coder: { ...known }, deviceId: null };
    const valid =
      request.inviteSecret !== undefined &&
      verifyPreviewToken(this.secret, this.jobId, request.inviteSecret, this.now());
    if (!valid) throw new HttpError(401, "This preview link has expired; open the preview again");
    const coder: Coder = {
      coderId: this.coders.size + 1,
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
    return { coder: { ...coder }, deviceId: null };
  }

  async addDevice(coderId: number, coderKey: string): Promise<number | null> {
    this.devices.set(coderKey, coderId);
    return null;
  }

  /** Previews keep nothing: no limits. */
  async checkAnswers(): Promise<void> {}

  /** Previews check the latest codebook on every request. */
  async deploymentStamp(): Promise<string | null> {
    return null;
  }

  async routeCoder(coderId: number, branch: string, assignment: CoderAssignments[string]): Promise<void> {
    const coder = this.coders.get(coderId);
    if (!coder) throw new HttpError(404, "Coder not found");
    coder.assignments = { ...coder.assignments, [branch]: assignment };
  }

  async setEnded(coderId: number, ended: SessionEnd | null): Promise<void> {
    const coder = this.coders.get(coderId);
    if (!coder) throw new HttpError(404, "Coder not found");
    coder.ended = ended;
  }

  private transfers = new Map<string, Transfer>();

  async createTransfer(tokenHash: string, transfer: Transfer): Promise<void> {
    this.transfers.set(tokenHash, transfer);
  }

  async redeemTransfer(tokenHash: string, now: Date): Promise<Transfer | null> {
    const transfer = this.transfers.get(tokenHash);
    this.transfers.delete(tokenHash);
    return transfer && transfer.expires > now ? transfer : null;
  }

  async putCoderValues(write: CoderValuesWrite): Promise<void> {
    const values = this.coderAnswers(write.coderId);
    for (const [name, value] of Object.entries(write.values)) {
      if (values[name]?.assigned || values[name]?.frozen) continue;
      values[name] = { value, assigned: write.assigned ?? false, frozen: false };
    }
  }

  async coderValues(coderId: number): Promise<Record<string, CoderValue>> {
    return { ...this.coderAnswers(coderId) };
  }

  async freezeCoderValues(coderId: number, names: string[]): Promise<void> {
    const values = this.coderAnswers(coderId);
    for (const name of names) if (values[name]) values[name] = { ...values[name], frozen: true };
  }

  private coderAnswers(coderId: number): Record<string, CoderValue> {
    let values = this.values.get(coderId);
    if (!values) this.values.set(coderId, (values = {}));
    return values;
  }

  async requestDeletion(coderId: number, request: DeletionRequest): Promise<void> {
    const coder = this.coders.get(coderId);
    if (coder) coder.deletionRequest = request;
  }

  async unitAnswers(coderId: number, unitId: number): Promise<Record<string, VariableValue>> {
    return { ...this.annotations.get(`${unitId}/${coderId}`)?.variables };
  }

  /** `<loop>/<unitId>/<coderId>` -> a finished coding. */
  private codings = new Map<string, Coding>();
  private basis: string | null = null;

  async listCodings(filter: { loop?: string; coderId?: number }): Promise<Coding[]> {
    return [...this.codings.values()]
      .filter((c) => (filter.loop === undefined || c.loop === filter.loop) && (filter.coderId === undefined || c.coderId === filter.coderId))
      .sort((a, b) => a.created.getTime() - b.created.getTime() || a.unitId - b.unitId);
  }

  async codingsBasis(): Promise<string | null> {
    return this.basis;
  }

  async replaceCodings(basis: string, codings: Coding[]): Promise<void> {
    this.codings = new Map(codings.map((c) => [`${c.loop}/${c.unitId}/${c.coderId}`, c]));
    this.basis = basis;
  }

  /** `<loop>/<unitset>/<coderId>/<unitId>` -> a lease. */
  private leases = new Map<string, Lease>();

  async listLeases(filter: { loop?: string; coderId?: number }): Promise<Lease[]> {
    return [...this.leases.values()].filter(
      (l) => (filter.loop === undefined || l.loop === filter.loop) && (filter.coderId === undefined || l.coderId === filter.coderId),
    );
  }

  async putLease(lease: Lease): Promise<void> {
    this.leases.set(`${lease.loop}/${lease.unitset}/${lease.coderId}/${lease.unitId}`, lease);
  }

  async coderValuesOf(variable: string): Promise<VariableValue[]> {
    return [...this.values.values()].flatMap((values) => (values[variable] ? [values[variable].value] : []));
  }

  /** One process, no concurrent writers but its own: runs `fn` as it is. */
  locked<T>(_key: string, fn: (store: Store) => Promise<T>): Promise<T> {
    return fn(this);
  }

  /** unitId/coderId -> the unit version last shown. */
  private served = new Map<string, number>();

  async recordServe(coderId: number, unitId: number, unitVersionId: number): Promise<void> {
    this.served.set(`${unitId}/${coderId}`, unitVersionId);
  }

  async servedVersion(coderId: number, unitId: number): Promise<number | null> {
    return this.served.get(`${unitId}/${coderId}`) ?? null;
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
    for (const coding of w.codings ?? []) {
      const key = `${coding.loop}/${w.unitId}/${w.coderId}`;
      const existing = this.codings.get(key);
      this.codings.set(key, { loop: coding.loop, unitId: w.unitId, coderId: w.coderId, agreement: coding.agreement, created: existing?.created ?? now, updated: now });
    }
  }

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    const rows: Finished[] = [];
    for (const group of request.loops) {
      const pick = (variables: Record<string, VariableValue>) =>
        group.values?.length ? { values: Object.fromEntries(group.values.filter((v) => v in variables).map((v) => [v, variables[v]])) } : {};
      if (group.level === "coder") {
        for (const c of this.coders.values()) {
          if (request.coderId !== undefined && c.coderId !== request.coderId) continue;
          const variables = Object.fromEntries(Object.entries(this.values.get(c.coderId) ?? {}).map(([k, v]) => [k, v.value]));
          if (group.variables.every((v) => v in variables)) {
            rows.push({ loop: group.loop, unitId: null, coderId: c.coderId, created: c.created, ...pick(variables) });
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
