import { createHmac, timingSafeEqual } from "node:crypto";
import { own, type DeletionRequest, type SessionEnd, type VariableValue } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { abandonedBefore, type Store } from "./store.js";
import { previewSessionValues } from "./sessionValues.js";
import type {
  Coder as StoredCoder,
  Coding,
  Lease,
  CoderValue,
  CoderAssignments,
  CoderValuesWrite,
  Finished,
  FinishedRequest,
  AnnotationWrite,
  ResolveCoderRequest,
  ResolvedCoder,
  Transfer,
} from "./types.js";

// Researcher previews (`<publicId>.preview`, contracts PreviewSessionSchema):
// the latest design and the real units come from the database, but coders
// and answers stay here, in memory. Nothing a preview does is stored, and it
// is gone when the server forgets the deployment.

/** A preview token (the link secret of a preview): `preview.<studyId>.<expiresAtMs>.<HMAC>`. */
export function previewToken(secret: string, studyId: number, expiresAt: number): string {
  return `preview.${studyId}.${expiresAt}.${sign(secret, studyId, expiresAt)}`;
}

/** Whether a preview token is this study's, signed by this server and not expired. */
export function verifyPreviewToken(secret: string, studyId: number, token: string, now: number): boolean {
  const match = /^preview\.(\d+)\.(\d+)\.([0-9a-f]{64})$/.exec(token);
  if (!match || Number(match[1]) !== studyId || Number(match[2]) <= now) return false;
  return timingSafeEqual(Buffer.from(sign(secret, studyId, Number(match[2]))), Buffer.from(match[3]));
}

function sign(secret: string, studyId: number, expiresAt: number): string {
  return createHmac("sha256", secret).update(`preview.${studyId}.${expiresAt}`).digest("hex");
}

interface Coder extends StoredCoder {
  created: Date;
}

export class PreviewStore implements Store {
  private coders = new Map<number, Coder>();
  /** Device keys -> session id: a device's preview session (a new one on "start over"). */
  private devices = new Map<string, number>();
  /** `<unitId>/<sessionId>` -> the coder's answers and when they were first written. */
  private annotations = new Map<
    string,
    { unitId: number; sessionId: number; variables: Record<string, VariableValue>; created: Date; updated: Date }
  >();
  /** Coder-level answers, per coder. */
  private values = new Map<number, Record<string, CoderValue>>();

  constructor(
    private db: Store,
    /** What preview tokens are signed with. */
    private secret: string,
    private studyId: number,
    private now: () => number = () => Date.now(),
  ) {}

  getDeployment: Store["getDeployment"] = () => this.db.getDeployment();
  getUnits: Store["getUnits"] = (ids, live) => this.db.getUnits(ids, live);

  async listCoders(): Promise<StoredCoder[]> {
    return [...this.coders.values()];
  }

  async resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    const knownId = request.newSession ? undefined : this.devices.get(request.coderKey);
    const known = knownId === undefined ? undefined : this.coders.get(knownId);
    // A copy, as from a database: changes go through the store.
    if (known) return { coder: { ...known }, deviceId: null };
    const valid =
      request.linkSecret !== undefined && verifyPreviewToken(this.secret, this.studyId, request.linkSecret, this.now());
    if (!valid) throw new HttpError(401, "This preview link has expired; open the preview again");
    const coder: Coder = {
      sessionId: this.coders.size + 1,
      assignments: {},
      ended: null,
      deletionRequest: null,
      session: request.sessionRules ? previewSessionValues(request.sessionRules, request.urlParams ?? {}) : {},
      linkId: null,
      email: null,
      knownUnits: null,
      created: new Date(this.now()),
    };
    this.coders.set(coder.sessionId, coder);
    this.devices.set(request.coderKey, coder.sessionId);
    return { coder: { ...coder }, deviceId: null };
  }

  /** Whether a device key has a session in this preview. */
  hasDevice(coderKey: string): boolean {
    return this.devices.has(coderKey);
  }

  /** Whether a transfer link (its hash) was made in this preview and not used yet. */
  hasTransfer(tokenHash: string): boolean {
    return this.transfers.has(tokenHash);
  }

  async addDevice(sessionId: number, coderKey: string): Promise<number | null> {
    this.devices.set(coderKey, sessionId);
    return null;
  }

  /** Previews keep nothing: no limits. */
  async checkAnswers(): Promise<void> {}

  /** Previews check the latest design on every request. */
  async deploymentStamp(): Promise<string | null> {
    return null;
  }

  async routeCoder(sessionId: number, loop: string, assignment: CoderAssignments[string]): Promise<void> {
    const coder = this.coders.get(sessionId);
    if (!coder) throw new HttpError(404, "Coder not found");
    coder.assignments = { ...coder.assignments, [loop]: assignment };
  }

  async setSessionValue(sessionId: number, name: string, value: string): Promise<string> {
    const coder = this.coders.get(sessionId);
    if (!coder) return value;
    if (!Object.hasOwn(coder.session, name)) coder.session = { ...coder.session, [name]: value };
    return coder.session[name]!;
  }

  async setEnded(sessionId: number, ended: SessionEnd | null): Promise<void> {
    const coder = this.coders.get(sessionId);
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
    const values = this.coderAnswers(write.sessionId);
    for (const [name, value] of Object.entries(write.values)) {
      if (own(values, name)?.assigned || own(values, name)?.frozen) continue;
      values[name] = { value, assigned: write.assigned ?? false, frozen: false };
    }
  }

  async coderValues(sessionId: number): Promise<Record<string, CoderValue>> {
    return { ...this.coderAnswers(sessionId) };
  }

  async freezeCoderValues(sessionId: number, names: string[]): Promise<void> {
    const values = this.coderAnswers(sessionId);
    for (const name of names) {
      const value = own(values, name);
      if (value) values[name] = { ...value, frozen: true };
    }
  }

  private coderAnswers(sessionId: number): Record<string, CoderValue> {
    let values = this.values.get(sessionId);
    if (!values) this.values.set(sessionId, (values = {}));
    return values;
  }

  /** Previews keep nothing. */
  async recordDisplay(): Promise<void> {}

  async setKnownUnits(sessionId: number, count: number): Promise<void> {
    const coder = this.coders.get(sessionId);
    if (coder) coder.knownUnits = count;
  }

  async requestDeletion(sessionId: number, request: DeletionRequest): Promise<void> {
    const coder = this.coders.get(sessionId);
    if (coder) coder.deletionRequest = request;
  }

  async unitAnswers(sessionId: number, unitId: number): Promise<Record<string, VariableValue>> {
    return { ...this.annotations.get(`${unitId}/${sessionId}`)?.variables };
  }

  /** `<loop>/<unitId>/<sessionId>` -> a finished coding. */
  private codings = new Map<string, Coding>();
  private basis: string | null = null;

  async listCodings(filter: { loop?: string; sessionId?: number }): Promise<Coding[]> {
    return [...this.codings.values()]
      .filter(
        (c) =>
          (filter.loop === undefined || c.loop === filter.loop) &&
          (filter.sessionId === undefined || c.sessionId === filter.sessionId),
      )
      .sort((a, b) => a.created.getTime() - b.created.getTime() || a.unitId - b.unitId);
  }

  async codingsBasis(): Promise<string | null> {
    return this.basis;
  }

  async replaceCodings(basis: string, codings: Coding[]): Promise<void> {
    this.codings = new Map(codings.map((c) => [`${c.loop}/${c.unitId}/${c.sessionId}`, c]));
    this.basis = basis;
  }

  /** `<loop>/<set>/<sessionId>/<unitId>` -> a lease. */
  private leases = new Map<string, Lease>();

  async listLeases(filter: { loop?: string; sessionId?: number }): Promise<Lease[]> {
    return [...this.leases.values()].filter(
      (l) =>
        (filter.loop === undefined || l.loop === filter.loop) &&
        (filter.sessionId === undefined || l.sessionId === filter.sessionId),
    );
  }

  async putLeases(leases: Lease[], now: Date): Promise<void> {
    if (leases.length === 0) return;
    for (const [key, lease] of this.leases) {
      const abandoned = lease.expires < abandonedBefore(now) || !!this.coders.get(lease.sessionId)?.ended;
      if (abandoned) this.leases.delete(key);
    }
    for (const lease of leases) this.leases.set(`${lease.loop}/${lease.set}/${lease.sessionId}/${lease.unitId}`, lease);
  }

  async coderValuesOf(
    variables: string[],
  ): Promise<{ values: Record<string, VariableValue>; session: Record<string, string> }[]> {
    return [...this.values].flatMap(([sessionId, values]) =>
      own(values, variables[0]!)
        ? [
            {
              values: Object.fromEntries(variables.flatMap((v) => (own(values, v) ? [[v, values[v]!.value]] : []))),
              session: this.coders.get(sessionId)?.session ?? {},
            },
          ]
        : [],
    );
  }

  /** One process, no concurrent writers but its own: runs `fn` as it is. */
  locked<T>(_key: string, fn: (store: Store) => Promise<T>): Promise<T> {
    return fn(this);
  }

  /** unitId/sessionId -> the unit version last shown. */
  private served = new Map<string, number>();

  async recordServe(sessionId: number, unitId: number, unitVersionId: number): Promise<void> {
    this.served.set(`${unitId}/${sessionId}`, unitVersionId);
  }

  async servedVersion(sessionId: number, unitId: number): Promise<number | null> {
    return this.served.get(`${unitId}/${sessionId}`) ?? null;
  }

  async putAnnotation(w: AnnotationWrite): Promise<void> {
    const now = new Date(this.now());
    const key = `${w.unitId}/${w.sessionId}`;
    const existing = this.annotations.get(key);
    this.annotations.set(key, {
      unitId: w.unitId,
      sessionId: w.sessionId,
      variables: { ...existing?.variables, ...w.variables },
      created: existing?.created ?? now,
      updated: now,
    });
    for (const coding of w.codings ?? []) {
      const key = `${coding.loop}/${w.unitId}/${w.sessionId}`;
      const existing = this.codings.get(key);
      this.codings.set(key, {
        loop: coding.loop,
        unitId: w.unitId,
        sessionId: w.sessionId,
        agreement: coding.agreement,
        created: existing?.created ?? now,
        updated: now,
      });
    }
  }

  async listFinished(request: FinishedRequest): Promise<Finished[]> {
    const rows: Finished[] = [];
    for (const group of request.loops) {
      const pick = (variables: Record<string, VariableValue>) =>
        group.values?.length
          ? {
              values: Object.fromEntries(
                group.values.filter((v) => Object.hasOwn(variables, v)).map((v) => [v, variables[v]]),
              ),
            }
          : {};
      if (group.level === "coder") {
        for (const c of this.coders.values()) {
          if (request.sessionId !== undefined && c.sessionId !== request.sessionId) continue;
          const variables = Object.fromEntries(
            Object.entries(this.values.get(c.sessionId) ?? {}).map(([k, v]) => [k, v.value]),
          );
          if (group.variables.every((v) => Object.hasOwn(variables, v))) {
            rows.push({
              loop: group.loop,
              unitId: null,
              sessionId: c.sessionId,
              created: c.created,
              ...pick(variables),
            });
          }
        }
        continue;
      }
      for (const a of this.annotations.values()) {
        if (request.sessionId !== undefined && a.sessionId !== request.sessionId) continue;
        if (group.variables.every((v) => Object.hasOwn(a.variables, v))) {
          rows.push({
            loop: group.loop,
            unitId: a.unitId,
            sessionId: a.sessionId,
            created: a.created,
            ...pick(a.variables),
          });
        }
      }
    }
    return rows.sort((a, b) => a.created.getTime() - b.created.getTime());
  }
}
