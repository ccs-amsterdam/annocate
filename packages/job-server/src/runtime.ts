import {
  DistributionRuleSchema,
  type BackendUnit,
  type CoderUnitResponse,
  type DeploymentSpec,
  type DeploymentStatus,
  type SessionResponse,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";
import { BackendClient, HttpError } from "./backend.js";
import { UnitsetQueue } from "./distribution.js";
import {
  agreementKey,
  collectCoderVariables,
  collectLoops,
  isDone,
  normalizeUnitset,
  validateVariables,
  type LoopInfo,
  type VariableType,
} from "./codebook.js";

export interface RuntimeOptions {
  /** Re-fetch the deployment spec at most this often, in case a refresh notification was missed. */
  specTtlMs: number;
  /** How long unit content stays cached. Units are immutable once deployed, so this only bounds retention. */
  unitTtlMs: number;
  /** Units fetched ahead of the one a coder asked for (per_coder mode). */
  prefetch: number;
  now: () => number;
}

export const DEFAULT_RUNTIME_OPTIONS: RuntimeOptions = {
  specTtlMs: 60_000,
  unitTtlMs: 30 * 60_000,
  prefetch: 3,
  now: () => Date.now(),
};

export interface Coder {
  coderId: number;
  variables: Record<string, VariableValue>;
}

/**
 * Everything the job server knows about one deployed job. All of it is a
 * cache of the db server (`load` rebuilds it from scratch) except crowd
 * leases, which are disposable. This is the unit that would live in one
 * Cloudflare Durable Object per deployment; on Node it is one object in
 * memory (see registry.ts).
 */
export class DeploymentRuntime {
  private spec!: DeploymentSpec;
  private loops: LoopInfo[] = [];
  private queues = new Map<string, UnitsetQueue>();
  private coderVariableTypes = new Map<string, VariableType>();
  /** coderId -> unitId -> variables. The coder's own annotations, to return with a unit. */
  private annotations = new Map<number, Map<number, Record<string, VariableValue>>>();
  private coders = new Map<string, Coder>();
  private units = new Map<number, { unit: BackendUnit; fetchedAt: number }>();
  private specCheckedAt = 0;
  private loadedAt = 0;
  private refreshing: Promise<void> | null = null;

  constructor(
    readonly id: string,
    private backend: BackendClient,
    private options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
  ) {}

  /** (Re)builds all state from the db server. */
  async load(): Promise<void> {
    const [spec, annotations] = await Promise.all([this.backend.getDeployment(), this.backend.listAnnotations()]);
    this.applySpec(spec);
    this.annotations.clear();
    for (const a of annotations) this.applyAnnotation(a.coderId, a.unitId, a.variables);
    this.loadedAt = this.options.now();
  }

  /** Re-fetches the spec; rebuilds if its version changed. Single-flight. */
  async refresh(force = false): Promise<void> {
    if (!force && this.options.now() - this.specCheckedAt < this.options.specTtlMs) return;
    this.refreshing ??= (async () => {
      try {
        this.evictExpiredUnits();
        const spec = await this.backend.getDeployment();
        if (spec.version !== this.spec.version) await this.load();
        else this.specCheckedAt = this.options.now();
      } finally {
        this.refreshing = null;
      }
    })();
    await this.refreshing;
  }

  private applySpec(spec: DeploymentSpec): void {
    this.spec = spec;
    this.specCheckedAt = this.options.now();
    const items = spec.codebook.items as TopLevelItem[];
    this.loops = collectLoops(items);
    this.coderVariableTypes = collectCoderVariables(items);
    this.queues.clear();
    for (const { loop, unitset } of this.loops) {
      if (this.queues.has(unitset)) continue;
      const unitIds = spec.unitsets.find((u) => u.name === unitset)?.unitIds ?? [];
      const rule = spec.distribution[unitset] ?? DistributionRuleSchema.parse({ mode: "per_coder" });
      this.queues.set(
        unitset,
        new UnitsetQueue(unitset, unitIds, rule, { randomize: !!loop.randomizeUnits, seed: spec.jobId * 1000 }),
      );
    }
  }

  private applyAnnotation(coderId: number, unitId: number, variables: Record<string, VariableValue>): void {
    let own = this.annotations.get(coderId);
    if (!own) this.annotations.set(coderId, (own = new Map()));
    own.set(unitId, variables);
    if (!isDone(variables)) return;
    for (const queue of this.queues.values()) {
      const rule = queue.rule;
      const key = rule.mode === "crowd" && rule.agreement ? agreementKey(variables, rule.agreement.variable) : null;
      queue.recordCoding(coderId, unitId, key);
    }
  }

  async resolveCoder(coderKey: string, inviteSecret?: string): Promise<Coder> {
    const cached = this.coders.get(coderKey);
    if (cached) return cached;
    const coder = await this.backend.resolveCoder(coderKey, inviteSecret);
    this.coders.set(coderKey, coder);
    return coder;
  }

  session(coder: Coder): SessionResponse {
    return {
      coderId: coder.coderId,
      jobId: this.spec.jobId,
      codebook: this.spec.codebook,
      progress: [...this.queues.values()].map((q) => ({ unitset: q.name, doneUnitIds: q.doneBy(coder.coderId) })),
    };
  }

  async nextUnit(coder: Coder, unitset: string | undefined): Promise<CoderUnitResponse | null> {
    if (!this.spec.active) throw new HttpError(409, "This job is not active");
    const queue = this.queues.get(normalizeUnitset(unitset));
    if (!queue) throw new HttpError(404, `No unit loop for unitset '${unitset}'`);

    // A unit the db server no longer has is dropped and we try the next one.
    const skip = new Set<number>();
    for (;;) {
      const next = queue.next(coder.coderId, this.options.now(), skip);
      if (!next) return null;
      const units = await this.getUnits([next.unitId, ...queue.upcoming(coder.coderId, next.unitId, this.options.prefetch)]);
      const unit = units.get(next.unitId);
      if (!unit) {
        for (const q of this.queues.values()) q.removeUnit(next.unitId);
        skip.add(next.unitId);
        continue;
      }
      return {
        id: unit.id,
        externalId: unit.externalId,
        data: unit.data,
        variables: this.annotations.get(coder.coderId)?.get(unit.id) ?? {},
      };
    }
  }

  async submitUnit(coder: Coder, unitId: number, variables: Record<string, VariableValue>): Promise<void> {
    const queues = [...this.queues.values()].filter((q) => q.has(unitId));
    if (queues.length === 0) throw new HttpError(404, "Unit is not part of this job");
    if (!queues.some((q) => q.canSubmit(coder.coderId, unitId))) {
      throw new HttpError(409, "Unit is not assigned to this coder");
    }

    const allowed = new Map(this.loops.filter((l) => queues.some((q) => q.name === l.unitset)).flatMap((l) => [...l.variables]));
    const errors = validateVariables(allowed, variables);
    if (errors.length > 0) throw new HttpError(400, errors.join("; "));

    // Write-through: only once the db server has it does it count.
    await this.backend.putAnnotation(unitId, coder.coderId, variables);
    this.applyAnnotation(coder.coderId, unitId, variables);
  }

  async submitCoderVariables(coder: Coder, variables: Record<string, VariableValue>): Promise<void> {
    const errors = validateVariables(this.coderVariableTypes, variables);
    if (errors.length > 0) throw new HttpError(400, errors.join("; "));
    await this.backend.putCoderVariables(coder.coderId, variables);
    coder.variables = variables;
  }

  status(): DeploymentStatus {
    const now = this.options.now();
    const coders = new Set<number>();
    for (const [coderId, own] of this.annotations) if (own.size > 0) coders.add(coderId);
    return {
      deploymentId: this.id,
      version: this.spec.version,
      active: this.spec.active,
      coders: coders.size,
      unitsets: [...this.queues.values()].map((q) => q.status(now)),
      loadedAt: new Date(this.loadedAt),
    };
  }

  private evictExpiredUnits(): void {
    const now = this.options.now();
    for (const [id, { fetchedAt }] of this.units) if (now - fetchedAt >= this.options.unitTtlMs) this.units.delete(id);
  }

  private async getUnits(ids: number[]): Promise<Map<number, BackendUnit>> {
    const now = this.options.now();
    const result = new Map<number, BackendUnit>();
    const missing: number[] = [];
    for (const id of ids) {
      const cached = this.units.get(id);
      if (cached && now - cached.fetchedAt < this.options.unitTtlMs) result.set(id, cached.unit);
      else missing.push(id);
    }
    // Only go to the db server if the unit actually asked for is missing;
    // prefetch candidates ride along with that request.
    if (missing.includes(ids[0])) {
      for (const unit of await this.backend.getUnits(missing)) {
        this.units.set(unit.id, { unit, fetchedAt: now });
        result.set(unit.id, unit);
      }
    }
    return result;
  }
}
