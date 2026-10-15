import {
  branchMatches,
  resolveUnitsetName,
  type BackendCoder,
  type BackendUnit,
  type CoderUnitResponse,
  type DeploymentSpec,
  type DeploymentStatus,
  type DynamicSource,
  type ResolveCoderRequest,
  type SessionResponse,
  type TransferResponse,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";
import { BackendClient, HttpError } from "./backend.js";
import { Codings, UnitPool, pickNext, type AgreementKeys } from "./distribution.js";
import {
  agreementKey,
  codeValue,
  codingsSignature,
  collectCoderVariables,
  collectLoops,
  finishedLoops,
  hasDynamicSources,
  loopAgreementVariables,
  validateVariables,
  variableCodes,
  type LoopInfo,
  type VariableType,
} from "./codebook.js";

export interface RuntimeOptions {
  /** Re-fetch the deployment spec at most this often, in case a refresh notification was missed. */
  specTtlMs: number;
  /** How long unit content stays cached. Units are immutable once deployed, so this only bounds retention. */
  unitTtlMs: number;
  /** Units fetched ahead of the one a coder asked for. */
  prefetch: number;
  /** How long a "continue on another device" link stays valid. */
  transferTtlMs: number;
  /** How long an idle coder's own annotations stay cached. They are re-fetched when the coder returns. */
  workspaceTtlMs: number;
  now: () => number;
  random: () => number;
}

export const DEFAULT_RUNTIME_OPTIONS: RuntimeOptions = {
  specTtlMs: 60_000,
  unitTtlMs: 30 * 60_000,
  prefetch: 3,
  transferTtlMs: 15 * 60_000,
  workspaceTtlMs: 30 * 60_000,
  now: () => Date.now(),
  random: Math.random,
};

/** A coder as held by the runtime: what the db server stores for them. */
export type Coder = BackendCoder;

type AutoVariable = Extract<VariableType, { type: "auto" }>;

/** A coder's own annotations (also unfinished ones): unitId -> variables. */
type Workspace = Map<number, Record<string, VariableValue>>;

/**
 * Everything the job server knows about one deployed job. All of it is a
 * cache of the db server except dynamic leases, which are disposable. The
 * cache has two parts (docs/architecture.md §3):
 *
 *  - distribution state, loaded eagerly by `load`: the spec, the coders,
 *    and -- for loops with dynamic sources only -- which coder finished which
 *    unit, plus agreement keys;
 *  - coder workspaces, the coder's own live annotations, loaded when the
 *    coder shows up and evicted when they go idle. A coder's finished units
 *    in every loop are derived from it.
 *
 * "Finished" is always relative to the current codebook: every question of
 * the loop has a live value (docs/architecture.md §8.2). Codings are kept
 * per loop, so a unit in two loops is finished in each separately.
 *
 * This is the unit that would live in one Cloudflare Durable Object per
 * deployment; on Node it is one object in memory (see registry.ts).
 */
export class DeploymentRuntime {
  private spec!: DeploymentSpec;
  private loops = new Map<string, LoopInfo>();
  private coderVariableTypes = new Map<string, VariableType>();
  private autoVariables: [string, AutoVariable][] = [];
  private unitsets = new Map<string, number[]>();
  /** Units the db server no longer has. */
  private removedUnits = new Set<number>();
  /** loop name -> finished codings in that loop. */
  private codings = new Map<string, Codings>();
  /** `codingsSignature` of the spec the codings were derived under. */
  private codingsBasis = "";
  /** Annotations written while `loadCodings` is fetching, replayed onto its result. */
  private pendingCodings: [coderId: number, variables: Record<string, VariableValue>, unitId: number][] | null = null;
  /** `<loop>/<unitset>/<dynamic rule>` -> pool, created when the first coder is routed to it. */
  private pools = new Map<string, UnitPool>();
  /** coderId -> the coder's own annotations, returned with a unit and merged into on resubmit. */
  private workspaces = new Map<number, { units: Workspace; usedAt: number }>();
  private workspaceLoads = new Map<number, Promise<Workspace>>();
  private coders = new Map<number, Coder>();
  private coderKeys = new Map<string, number>();
  private units = new Map<number, { unit: BackendUnit; fetchedAt: number }>();
  /** One-time transfer tokens -> coder key. Memory only: losing them just means making a new link. */
  private transfers = new Map<string, { coderKey: string; expires: number }>();
  private specCheckedAt = 0;
  private loadedAt = 0;
  private refreshing: Promise<void> | null = null;

  constructor(
    readonly id: string,
    private backend: BackendClient,
    private options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
  ) {}

  // --- state ------------------------------------------------------------------

  /** (Re)builds the distribution state from the db server. Coder workspaces are loaded on demand. */
  async load(): Promise<void> {
    const [spec, coders] = await Promise.all([this.backend.getDeployment(), this.backend.listCoders()]);
    this.applySpec(spec);
    this.coders = new Map(coders.map((c) => [c.coderId, c]));
    await this.loadCodings();
    this.loadedAt = this.options.now();
  }

  /**
   * Re-fetches the spec, and applies it if its version changed. Finished
   * codings are derived from annotations *and* the codebook's loops, so they
   * are kept only if the loops' questions, dynamic sources and agreement
   * variables are unchanged, and no annotations were reset meanwhile
   * (`annotationEpoch`). Single-flight.
   */
  async refresh(force = false): Promise<void> {
    if (!force && this.options.now() - this.specCheckedAt < this.options.specTtlMs) return;
    this.refreshing ??= (async () => {
      try {
        this.evictExpired();
        const spec = await this.backend.getDeployment();
        if (spec.version === this.spec.version && spec.annotationEpoch === this.spec.annotationEpoch) {
          this.specCheckedAt = this.options.now();
          return;
        }
        const epochChanged = spec.annotationEpoch !== this.spec.annotationEpoch;
        this.applySpec(spec);
        if (epochChanged || codingsSignature(this.loops.values()) !== this.codingsBasis) await this.loadCodings();
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
    this.loops = new Map(collectLoops(items).map((l) => [l.loop.name, l]));
    this.coderVariableTypes = collectCoderVariables(items);
    this.autoVariables = [...this.coderVariableTypes].filter((e): e is [string, AutoVariable] => e[1].type === "auto");
    this.unitsets = new Map(spec.unitsets.map((u) => [u.name, u.unitIds]));
    this.pools.clear();
    this.removedUnits.clear();
  }

  /**
   * Rebuilds the codings: every coder's finished units for loops with
   * dynamic sources (global state those need), and drops the workspaces, so
   * other loops' codings are rebuilt per coder when they show up.
   */
  private async loadCodings(): Promise<void> {
    const dynamicLoops = [...this.loops.values()].filter(hasDynamicSources);
    const pending: NonNullable<typeof this.pendingCodings> = [];
    this.pendingCodings = pending;
    try {
      const rows = await this.backend.listFinished({
        loops: dynamicLoops.map((info) => ({
          loop: info.loop.name,
          variables: [...info.variables.keys()],
          values: loopAgreementVariables(info),
        })),
      });
      this.codings = new Map();
      this.workspaces.clear();
      for (const row of rows) {
        const info = this.loops.get(row.loop);
        if (info) this.codingsFor(row.loop).record(row.coderId, row.unitId, agreementKeys(row.values ?? {}, info));
      }
      this.pendingCodings = null; // replaying must not append to the list being replayed
      for (const [coderId, variables, unitId] of pending) this.recordFinished(coderId, unitId, variables);
      this.codingsBasis = codingsSignature(this.loops.values());
      this.pools.clear(); // pools hold the Codings they were created with
    } finally {
      this.pendingCodings = null;
    }
  }

  private codingsFor(loop: string): Codings {
    let codings = this.codings.get(loop);
    if (!codings) this.codings.set(loop, (codings = new Codings()));
    return codings;
  }

  /** Records a unit as finished in every loop these answers finish it in. */
  private recordFinished(coderId: number, unitId: number, variables: Record<string, VariableValue>): void {
    for (const info of finishedLoops(variables, this.loops.values())) {
      this.codingsFor(info.loop.name).record(coderId, unitId, agreementKeys(variables, info));
    }
    this.pendingCodings?.push([coderId, variables, unitId]);
  }

  /** The coder's own annotations, fetched from the db server if they aren't cached. */
  private workspace(coderId: number): Promise<Workspace> {
    const cached = this.workspaces.get(coderId);
    if (cached) {
      cached.usedAt = this.options.now();
      return Promise.resolve(cached.units);
    }
    let loading = this.workspaceLoads.get(coderId);
    if (!loading) {
      loading = (async () => {
        try {
          const annotations = await this.backend.listAnnotations(coderId);
          annotations.sort((a, b) => a.created.getTime() - b.created.getTime());
          const units: Workspace = new Map(annotations.map((a) => [a.unitId, a.variables]));
          // The coder's finished units, in order of first answer (loops without
          // dynamic sources only learn them here).
          for (const a of annotations) this.recordFinished(coderId, a.unitId, a.variables);
          this.workspaces.set(coderId, { units, usedAt: this.options.now() });
          return units;
        } finally {
          this.workspaceLoads.delete(coderId);
        }
      })();
      this.workspaceLoads.set(coderId, loading);
    }
    return loading;
  }

  // --- coders -----------------------------------------------------------------

  /**
   * The coder for a coder key; the db server creates it on first use (from
   * the invite, with participant id / new-session confirmation, see
   * docs/coder-identity.md).
   */
  async resolveCoder(request: ResolveCoderRequest): Promise<Coder> {
    const known = this.coderKeys.get(request.coderKey);
    if (known !== undefined) {
      // Their workspace may have been evicted or dropped by a reload.
      await this.workspace(known);
      return this.coders.get(known)!;
    }
    const coder = await this.backend.resolveCoder(request);
    const coderKey = request.coderKey;
    this.coders.set(coder.coderId, coder);
    this.coderKeys.set(coderKey, coder.coderId);
    await Promise.all([this.assignAutoVariables(coder), this.workspace(coder.coderId)]);
    return coder;
  }

  /**
   * Assigns server-side `auto` variables (random / balanced / invite
   * fallback) the coder doesn't have yet. Once assigned they never change.
   */
  private async assignAutoVariables(coder: Coder): Promise<void> {
    let changed = false;
    for (const [name, variable] of this.autoVariables) {
      if (variableCodes(coder.variables)[name] !== undefined) continue;
      const method = variable.source === "invite" ? variable.fallback : variable.source;
      if (method !== "random" && method !== "balanced") continue;
      const options = variable.options ?? [];
      if (options.length === 0) continue;
      const code = method === "random" ? this.drawWeighted(options) : this.leastUsed(name, options);
      coder.variables = { ...coder.variables, [name]: codeValue(code) };
      changed = true;
    }
    if (changed) await this.saveCoder(coder);
  }

  private drawWeighted(options: { code: string; weight?: number }[]): string {
    const total = options.reduce((n, o) => n + (o.weight ?? 1), 0);
    let r = this.options.random() * total;
    for (const o of options) {
      r -= o.weight ?? 1;
      if (r < 0) return o.code;
    }
    return options[options.length - 1].code;
  }

  private leastUsed(name: string, options: { code: string }[]): string {
    const counts = new Map(options.map((o) => [o.code, 0]));
    for (const c of this.coders.values()) {
      const code = variableCodes(c.variables)[name];
      if (code !== undefined && counts.has(code)) counts.set(code, counts.get(code)! + 1);
    }
    return options.reduce((best, o) => (counts.get(o.code)! < counts.get(best.code)! ? o : best)).code;
  }

  private async saveCoder(coder: Coder): Promise<void> {
    await this.backend.putCoder(coder.coderId, { variables: coder.variables, assignments: coder.assignments });
  }

  /** A one-time token that lets another device continue this coder's session (docs/coder-identity.md §4). */
  createTransfer(coderKey: string): TransferResponse {
    const now = this.options.now();
    for (const [token, t] of this.transfers) if (t.expires <= now) this.transfers.delete(token);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expires = now + this.options.transferTtlMs;
    this.transfers.set(token, { coderKey, expires });
    return { token, expiresAt: new Date(expires) };
  }

  /** Exchanges a transfer token (once) for the coder key. */
  redeemTransfer(token: string): string {
    const transfer = this.transfers.get(token);
    this.transfers.delete(token);
    if (!transfer || transfer.expires <= this.options.now()) {
      throw new HttpError(404, "This link has expired or was already used", "transfer_invalid");
    }
    return transfer.coderKey;
  }

  session(coder: Coder): SessionResponse {
    return {
      coderId: coder.coderId,
      jobId: this.spec.jobId,
      codebook: this.spec.codebook,
      progress: [...this.loops.values()].map((info) => {
        const pools = this.assignedPools(coder, info.loop.name);
        return {
          unitset: info.loop.name,
          doneUnitIds: this.codingsFor(info.loop.name).doneBy(coder.coderId).filter((id) => pools.some((p) => p.has(id))),
          totalUnits: this.expectedUnits(info, pools),
        };
      }),
      variables: coder.variables,
    };
  }

  /** Coder-level answers. Server-assigned auto variables can't be overwritten by the client. */
  async submitCoderVariables(coder: Coder, variables: Record<string, VariableValue>): Promise<void> {
    const errors = validateVariables(this.coderVariableTypes, variables);
    if (errors.length > 0) throw new HttpError(400, errors.join("; "));

    const merged = { ...variables };
    for (const [name, variable] of this.autoVariables) {
      if (variable.source === "url_param") continue;
      if (coder.variables[name]) merged[name] = coder.variables[name];
      else delete merged[name];
    }
    const updated = { ...coder, variables: merged };
    await this.saveCoder(updated);
    coder.variables = merged;
  }

  /** How many units the coder will get in a loop, if that doesn't depend on other coders. */
  private expectedUnits(info: LoopInfo, pools: UnitPool[]): number | null {
    if (pools.length === 0) return null;
    const max = info.loop.maxUnits ?? Infinity;
    if (pools.some((p) => p.mode === "dynamic")) return Number.isFinite(max) ? max : null;
    const units = new Set<number>();
    for (const pool of pools) for (const id of pool.unitIds) units.add(id);
    return Math.min(units.size, max);
  }

  // --- routing ----------------------------------------------------------------

  private pool(loop: string, unitset: string, dynamic: DynamicSource | undefined): UnitPool {
    const key = `${loop}/${unitset}/${JSON.stringify(dynamic ?? null)}`;
    let pool = this.pools.get(key);
    if (!pool) {
      const unitIds = (this.unitsets.get(unitset) ?? []).filter((id) => !this.removedUnits.has(id));
      this.pools.set(key, (pool = new UnitPool(unitset, unitIds, dynamic, this.codingsFor(loop))));
    }
    return pool;
  }

  /** The branch whose resolved unitset names equal `names`, if the codebook still has one. */
  private poolsFor(info: LoopInfo, names: string[], values: Record<string, string | undefined>): UnitPool[] | null {
    for (const branch of info.loop.units) {
      const resolved = branch.sources.map((s) => resolveUnitsetName(s.unitset, values));
      if (resolved.length !== names.length || resolved.some((n, i) => n !== names[i])) continue;
      return branch.sources.map((s, i) => this.pool(info.loop.name, names[i], s.dynamic));
    }
    return null;
  }

  /** Pools the coder is already routed to for a loop (no new routing). */
  private assignedPools(coder: Coder, loop: string): UnitPool[] {
    const info = this.loops.get(loop);
    const names = coder.assignments[loop];
    if (!info || !names) return [];
    return this.poolsFor(info, names, variableCodes(coder.variables)) ?? [];
  }

  /**
   * Routes a coder in a loop: the first branch whose `when` matches. Sticky:
   * stored on the db server, and reused as long as the codebook still has a
   * branch with the same unitsets (so a codebook update that keeps it doesn't
   * move coders around).
   */
  private async route(coder: Coder, info: LoopInfo): Promise<UnitPool[]> {
    const values = variableCodes(coder.variables);
    const stored = coder.assignments[info.loop.name];
    const existing = stored && this.poolsFor(info, stored, values);
    if (existing) return existing;

    const branch = info.loop.units.find((b) => branchMatches(b.when, values));
    if (!branch) return [];
    const names = branch.sources.map((s) => resolveUnitsetName(s.unitset, values));
    const missing = branch.sources.find((s, i) => names[i] === null || !this.unitsets.has(names[i]!));
    if (missing) {
      throw new HttpError(409, `Unit loop '${info.loop.name}': unitset '${missing.unitset}' does not exist for this coder`);
    }

    coder.assignments = { ...coder.assignments, [info.loop.name]: names as string[] };
    await this.saveCoder(coder);
    return branch.sources.map((s, i) => this.pool(info.loop.name, names[i]!, s.dynamic));
  }

  // --- units ------------------------------------------------------------------

  async nextUnit(coder: Coder, loopName: string): Promise<CoderUnitResponse | null> {
    if (!this.spec.active) throw new HttpError(409, "This job is not active");
    const info = this.loops.get(loopName);
    if (!info) throw new HttpError(404, `No unit loop '${loopName}'`);
    const [pools, own] = await Promise.all([this.route(coder, info), this.workspace(coder.coderId)]);

    for (;;) {
      const next = pickNext(pools, coder.coderId, this.codingsFor(loopName), {
        order: info.loop.order ?? "sequential",
        maxUnits: info.loop.maxUnits,
        seed: this.spec.jobId * 1000,
        now: this.options.now(),
      });
      if (!next) return null;

      const upcoming = pools.flatMap((p) => p.candidates(coder.coderId, this.options.now(), null)).slice(0, this.options.prefetch);
      const units = await this.getUnits([next.unitId, ...upcoming.filter((id) => id !== next.unitId)]);
      const unit = units.get(next.unitId);
      if (!unit) {
        // The db server no longer has it: drop it everywhere and try the next one.
        this.removedUnits.add(next.unitId);
        for (const pool of this.pools.values()) pool.removeUnit(next.unitId);
        continue;
      }
      next.pool.take(coder.coderId, next.unitId, this.options.now());
      return {
        id: unit.id,
        externalId: unit.externalId,
        data: unit.data,
        variables: own.get(unit.id) ?? {},
      };
    }
  }

  /**
   * A unit the coder already worked on in a loop (has answers for, or holds
   * a lease on), so a resumed session can navigate back to it.
   */
  async loopUnit(coder: Coder, loopName: string, unitId: number): Promise<CoderUnitResponse> {
    if (!this.loops.has(loopName)) throw new HttpError(404, `No unit loop '${loopName}'`);
    const own = (await this.workspace(coder.coderId)).get(unitId);
    const pools = this.assignedPools(coder, loopName);
    // Only units the coder has worked on (or holds right now): no peeking ahead.
    if (!pools.some((p) => p.has(unitId) && (own !== undefined || p.heldLease(coder.coderId) === unitId))) {
      throw new HttpError(404, "This unit is not part of your session");
    }
    const unit = (await this.getUnits([unitId])).get(unitId);
    if (!unit) throw new HttpError(404, "Unit not found");
    return { id: unit.id, externalId: unit.externalId, data: unit.data, variables: own ?? {} };
  }

  /**
   * A finished unit: answers to every question of the loop (`skip` for
   * questions a condition hid). Partial submissions are refused, so a stored
   * unit is always complete under the codebook it was written with.
   */
  async submitUnit(
    coder: Coder,
    unitId: number,
    variables: Record<string, VariableValue>,
    loopName?: string,
  ): Promise<void> {
    const loops = [...this.loops.values()].filter(
      (info) =>
        (loopName === undefined || info.loop.name === loopName) &&
        this.assignedPools(coder, info.loop.name).some((p) => p.canSubmit(coder.coderId, unitId)),
    );
    if (loops.length === 0) throw new HttpError(409, "Unit is not assigned to this coder");

    const info = loops.find((l) => [...l.variables.keys()].every((name) => name in variables));
    if (!info) {
      const missing = [...loops[0].variables.keys()].filter((name) => !(name in variables));
      throw new HttpError(400, `Unit not finished: no answer for ${missing.join(", ")}`);
    }
    const errors = validateVariables(info.variables, variables);
    if (errors.length > 0) throw new HttpError(400, errors.join("; "));

    // Write-through: only once the db server has it does it count. The db
    // server leaves values of other variables (e.g. questions an update
    // removed) alone, so they stay as data.
    await this.backend.putAnnotation(unitId, coder.coderId, variables, this.spec.codebook.id);
    const own = await this.workspace(coder.coderId);
    const merged = { ...own.get(unitId), ...variables };
    own.set(unitId, merged);
    this.recordFinished(coder.coderId, unitId, merged);
  }

  get version(): number {
    return this.spec.version;
  }

  /**
   * Progress per loop source. Computed on demand from the db server (every
   * coder's finished units in every loop), since the job server only keeps
   * global codings for dynamic loops.
   */
  async status(): Promise<DeploymentStatus> {
    const now = this.options.now();
    const rows = await this.backend.listFinished({
      loops: [...this.loops.values()].map((info) => ({
        loop: info.loop.name,
        variables: [...info.variables.keys()],
        values: loopAgreementVariables(info),
      })),
    });
    const finished = new Map<string, Codings>();
    for (const row of rows) {
      const info = this.loops.get(row.loop);
      if (!info) continue;
      if (!finished.has(row.loop)) finished.set(row.loop, new Codings());
      finished.get(row.loop)!.record(row.coderId, row.unitId, agreementKeys(row.values ?? {}, info));
    }

    const sources: DeploymentStatus["sources"] = [];
    for (const [loop] of this.loops) {
      const routed = [...this.coders.values()].filter((c) => c.assignments[loop]);
      const seen = new Set<UnitPool>();
      for (const coder of routed) {
        for (const pool of this.assignedPools(coder, loop)) {
          if (seen.has(pool)) continue;
          seen.add(pool);
          const coders = routed.filter((c) => c.assignments[loop].includes(pool.unitset)).map((c) => c.coderId);
          const counted = new UnitPool(pool.unitset, [...pool.unitIds], pool.dynamic, finished.get(loop) ?? new Codings());
          sources.push({
            loop,
            unitset: pool.unitset,
            ...counted.status(now, coders),
            leasedUnits: pool.status(now, coders).leasedUnits,
            coders: coders.length,
          });
        }
      }
    }
    return {
      deploymentId: this.id,
      version: this.spec.version,
      active: this.spec.active,
      coders: this.coders.size,
      sources,
      loadedAt: new Date(this.loadedAt),
    };
  }

  private evictExpired(): void {
    const now = this.options.now();
    for (const [id, { fetchedAt }] of this.units) if (now - fetchedAt >= this.options.unitTtlMs) this.units.delete(id);
    for (const [id, { usedAt }] of this.workspaces) if (now - usedAt >= this.options.workspaceTtlMs) this.workspaces.delete(id);
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

function agreementKeys(variables: Record<string, VariableValue>, info: LoopInfo): AgreementKeys {
  return Object.fromEntries(loopAgreementVariables(info).map((v) => [v, agreementKey(variables, v)]));
}
