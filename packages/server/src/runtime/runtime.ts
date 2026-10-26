import {
  unitsetHasReferences,
  unitsetMatchesSource,
  type CoderUnitResponse,
  type DeploymentStatus,
  type DynamicSource,
  type SessionResponse,
  type TransferResponse,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { Codings, UnitPool, pickNext, type AgreementKeys } from "./distribution.js";
import type { Store } from "./store.js";
import type { Coder, DeploymentSpec, ResolveCoderRequest, Unit } from "./types.js";
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

/** The branch of a loop the client chose (`GET /loop/:loop/next?branch=&unitsets=`), see contracts NextUnitQuerySchema. */
export interface BranchChoice {
  branch?: number;
  unitsets: string[];
}

export interface RuntimeOptions {
  /** Re-fetch the deployment spec at most this often, in case a refresh notification was missed. */
  specTtlMs: number;
  /**
   * Memory budget for cached unit content, estimated from its JSON size.
   * Over budget, the least recently used units go first. Units shouldn't
   * change once coding started, so they are not re-fetched otherwise; a
   * refresh with `units` drops them on purpose.
   */
  unitCacheBytes: number;
  /** Units fetched ahead of the one a coder asked for. */
  prefetch: number;
  /** How long a "continue on another device" link stays valid. */
  transferTtlMs: number;
  /**
   * Memory budget for active coders' own annotations. Over budget, coders
   * who finished every loop go first, then the least recently active. They
   * are re-fetched when the coder returns.
   */
  workspaceCacheBytes: number;
  /** Upper bound on keeping unused units and coder annotations, however much room is left. */
  maxIdleMs: number;
  /** A loaded deployment nobody used for this long is dropped (registry.ts). */
  deploymentIdleMs: number;
  now: () => number;
  random: () => number;
}

export const DEFAULT_RUNTIME_OPTIONS: RuntimeOptions = {
  specTtlMs: 60_000,
  unitCacheBytes: 64 * 2 ** 20,
  prefetch: 3,
  transferTtlMs: 15 * 60_000,
  workspaceCacheBytes: 32 * 2 ** 20,
  maxIdleMs: 24 * 60 * 60_000,
  deploymentIdleMs: 6 * 60 * 60_000,
  now: () => Date.now(),
  random: Math.random,
};

export type { Coder };

type AutoVariable = Extract<VariableType, { type: "auto" }>;

/** A coder's own annotations (also unfinished ones): unitId -> variables. */
type Workspace = Map<number, Record<string, VariableValue>>;

interface WorkspaceEntry {
  units: Workspace;
  usedAt: number;
  /** Estimated size, for the memory budget. */
  bytes: number;
  /** Loops where the coder was told there are no more units. All of them: the coder is done, evicted first. */
  exhausted: Set<string>;
  /** unitId -> hash of the content last shown to the coder, sent along with their annotation. */
  served: Map<number, string>;
}

/** Rough size of one `served` entry. */
const SERVED_BYTES = 32;

/** Rough in-memory size of a JSON value: enough to compare against a budget. */
const sizeOf = (value: unknown) => JSON.stringify(value).length;

/**
 * Everything the server keeps in memory for one deployed job. All of it is a
 * cache of the database except dynamic leases, which are disposable. The
 * cache has two parts (docs/architecture.md §3):
 *
 *  - distribution state, loaded eagerly by `load`: the spec, for loops with
 *    dynamic sources which coder finished which unit (plus agreement keys),
 *    and for `balanced` auto variables which coder has which option;
 *  - per active coder: the coder record (variables, assignments) and their
 *    workspace, i.e. their own live annotations, loaded when the coder shows
 *    up and evicted when they go idle. A coder's finished units in every loop
 *    are derived from the workspace.
 *
 * "Finished" is always relative to the current codebook: every question of
 * the loop has a live value (docs/architecture.md §8.2). Codings are kept
 * per loop, so a unit in two loops is finished in each separately.
 *
 * One per deployment, in memory (registry.ts). This assumes one server
 * process; more would need the leases and codings in the database.
 */
export class DeploymentRuntime {
  private spec!: DeploymentSpec;
  private loops = new Map<string, LoopInfo>();
  private coderVariableTypes = new Map<string, VariableType>();
  private autoVariables: [string, AutoVariable][] = [];
  private unitsets = new Map<string, number[]>();
  /** Units that no longer exist. */
  private removedUnits = new Set<number>();
  /** loop name -> finished codings in that loop. */
  private codings = new Map<string, Codings>();
  /** `codingsSignature` of the spec the codings were derived under. */
  private codingsBasis = "";
  /** Annotations written while `loadCodings` is fetching, replayed onto its result. */
  private pendingCodings: [coderId: number, variables: Record<string, VariableValue>, unitId: number][] | null = null;
  /** `<loop>/<unitset>/<dynamic rule>` -> pool, created when the first coder is routed to it. */
  private pools = new Map<string, UnitPool>();
  /**
   * coderId -> the coder's own annotations, returned with a unit and merged
   * into on resubmit. Map order is recency order (least recent first).
   */
  private workspaces = new Map<number, WorkspaceEntry>();
  private workspaceBytes = 0;
  private workspaceLoads = new Map<number, Promise<Workspace>>();
  /** Active coders only; evicted together with their workspace. */
  private coders = new Map<number, Coder>();
  private coderKeys = new Map<string, number>();
  /** `balanced` auto variable -> coderId -> option, for every coder that has one. */
  private balanced = new Map<string, Map<number, string>>();
  /** Unit content; Map order is recency order (least recent first). */
  private units = new Map<number, { unit: Unit; bytes: number; usedAt: number }>();
  private unitBytes = 0;
  /** One-time transfer tokens -> coder key. Memory only: losing them just means making a new link. */
  private transfers = new Map<string, { sessionKey: string; expires: number }>();
  private specCheckedAt = 0;
  private loadedAt = 0;
  private refreshing: Promise<void> | null = null;

  constructor(
    readonly id: string,
    private store: Store,
    private options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
  ) {}

  // --- state ------------------------------------------------------------------

  /** (Re)builds the distribution state from the database. Coder workspaces are loaded on demand. */
  async load(): Promise<void> {
    this.applySpec(await this.store.getDeployment());
    await Promise.all([this.loadCodings(), this.loadBalanced()]);
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
        const spec = await this.store.getDeployment();
        if (spec.version === this.spec.version && spec.annotationEpoch === this.spec.annotationEpoch) {
          this.specCheckedAt = this.options.now();
          return;
        }
        const epochChanged = spec.annotationEpoch !== this.spec.annotationEpoch;
        const balancedBefore = this.balancedVariables().join();
        this.applySpec(spec);
        await Promise.all([
          epochChanged || codingsSignature(this.loops.values()) !== this.codingsBasis ? this.loadCodings() : null,
          this.balancedVariables().join() !== balancedBefore ? this.loadBalanced() : null,
        ]);
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
      const rows = await this.store.listFinished({
        loops: dynamicLoops.map((info) => ({
          loop: info.loop.name,
          variables: [...info.variables.keys()],
          values: loopAgreementVariables(info),
        })),
      });
      this.codings = new Map();
      this.workspaces.clear();
      this.workspaceBytes = 0;
      for (const row of rows) {
        const info = this.loops.get(row.loop);
        if (info && row.unitId !== null) {
          this.codingsFor(row.loop).record(row.coderId, row.unitId, agreementKeys(row.values ?? {}, info));
        }
      }
      this.pendingCodings = null; // replaying must not append to the list being replayed
      for (const [coderId, variables, unitId] of pending) this.recordFinished(coderId, unitId, variables);
      this.codingsBasis = codingsSignature(this.loops.values());
      this.pools.clear(); // pools hold the Codings they were created with
    } finally {
      this.pendingCodings = null;
    }
  }

  /** Auto variables assigned `balanced` (directly, or as fallback for a missing invite value). */
  private balancedVariables(): string[] {
    return this.autoVariables
      .filter(([, v]) => (v.source === "invite" ? v.fallback : v.source) === "balanced")
      .map(([name]) => name);
  }

  /**
   * Which option every coder has, for `balanced` variables: coder-level
   * rows from the bulk query. Kept up to date in memory as
   * coders show up; options assigned while this loads are kept.
   */
  private async loadBalanced(): Promise<void> {
    const names = this.balancedVariables();
    if (names.length === 0) {
      this.balanced = new Map();
      return;
    }
    const rows = await this.store.listFinished({
      loops: names.map((name) => ({ loop: name, level: "coder", variables: [name], values: [name] })),
    });
    const balanced = new Map(names.map((name) => [name, new Map(this.balanced.get(name))]));
    for (const row of rows) {
      const code = variableCodes(row.values ?? {})[row.loop];
      if (code !== undefined) balanced.get(row.loop)?.set(row.coderId, code);
    }
    this.balanced = balanced;
  }

  /** Records the coder's options for `balanced` variables. */
  private countBalanced(coder: Coder): void {
    const codes = variableCodes(coder.variables);
    for (const [name, byCoder] of this.balanced) {
      if (codes[name] !== undefined) byCoder.set(coder.coderId, codes[name]);
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

  /** The coder's own annotations, read from the database if they aren't cached. */
  private workspace(coderId: number): Promise<Workspace> {
    const cached = this.workspaces.get(coderId);
    if (cached) {
      cached.usedAt = this.options.now();
      this.workspaces.delete(coderId); // move to the most recent end
      this.workspaces.set(coderId, cached);
      return Promise.resolve(cached.units);
    }
    let loading = this.workspaceLoads.get(coderId);
    if (!loading) {
      loading = (async () => {
        try {
          const annotations = await this.store.listAnnotations(coderId);
          annotations.sort((a, b) => a.created.getTime() - b.created.getTime());
          const units: Workspace = new Map(annotations.map((a) => [a.unitId, a.variables]));
          // The coder's finished units, in order of first answer (loops without
          // dynamic sources only learn them here).
          for (const a of annotations) this.recordFinished(coderId, a.unitId, a.variables);
          const bytes = annotations.reduce((n, a) => n + sizeOf(a.variables), 0);
          this.workspaces.set(coderId, { units, usedAt: this.options.now(), bytes, exhausted: new Set(), served: new Map() });
          this.workspaceBytes += bytes;
          this.trimWorkspaces(coderId);
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
   * The coder for a coder key, created on first use (from the invite, with
   * participant id / new-session confirmation, see docs/coder-identity.md).
   * `urlParams` are the page's query parameters, for `url_param` auto
   * variables: stored now, so the coder can come back without them.
   */
  async resolveCoder(request: ResolveCoderRequest, urlParams: Record<string, string> = {}): Promise<Coder> {
    const known = this.coderKeys.get(request.coderKey);
    const cached = known !== undefined ? this.coders.get(known) : undefined;
    if (cached) {
      // Their workspace may have been dropped by a reload; a URL value missed earlier is filled in.
      await Promise.all([this.workspace(cached.coderId), this.assignAutoVariables(cached, urlParams)]);
      return cached;
    }
    // Not active (new, evicted, or the server restarted): the database has
    // the record, including the coder-level values.
    const coder = await this.store.resolveCoder(request);
    this.coders.set(coder.coderId, coder);
    this.coderKeys.set(request.coderKey, coder.coderId);
    this.countBalanced(coder);
    await Promise.all([this.assignAutoVariables(coder, urlParams), this.workspace(coder.coderId)]);
    return coder;
  }

  /**
   * Assigns server-side `auto` variables (random / balanced / invite
   * fallback / URL parameter) the coder doesn't have yet. Once assigned they
   * never change. Saved before the coder is answered.
   */
  private async assignAutoVariables(coder: Coder, urlParams: Record<string, string> = {}): Promise<void> {
    let changed = false;
    for (const [name, variable] of this.autoVariables) {
      if (variableCodes(coder.variables)[name] !== undefined) continue;
      if (variable.source === "url_param") {
        const value = urlParams[variable.urlParam ?? name];
        // A value outside the codebook's options (if it lists any) is ignored, not stored.
        if (value === undefined || value.length > 200 || (variable.options?.length && !variable.options.some((o) => o.code === value))) continue;
        coder.variables = { ...coder.variables, [name]: codeValue(value) };
        changed = true;
        continue;
      }
      const method = variable.source === "invite" ? variable.fallback : variable.source;
      if (method !== "random" && method !== "balanced") continue;
      const options = variable.options ?? [];
      if (options.length === 0) continue;
      const code = method === "random" ? this.drawWeighted(options) : this.leastUsed(name, options);
      coder.variables = { ...coder.variables, [name]: codeValue(code) };
      changed = true;
    }
    if (changed) {
      this.countBalanced(coder);
      await this.saveCoder(coder);
    }
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
    for (const code of this.balanced.get(name)?.values() ?? []) {
      if (counts.has(code)) counts.set(code, counts.get(code)! + 1);
    }
    return options.reduce((best, o) => (counts.get(o.code)! < counts.get(best.code)! ? o : best)).code;
  }

  private async saveCoder(coder: Coder): Promise<void> {
    await this.store.putCoder(coder.coderId, { variables: coder.variables, assignments: coder.assignments });
  }

  /** A one-time token that lets another device continue this coder's session (docs/coder-identity.md §4). */
  createTransfer(sessionKey: string): TransferResponse {
    const now = this.options.now();
    for (const [token, t] of this.transfers) if (t.expires <= now) this.transfers.delete(token);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expires = now + this.options.transferTtlMs;
    this.transfers.set(token, { sessionKey, expires });
    return { token, expiresAt: new Date(expires) };
  }

  /** Exchanges a transfer token (once) for the session key, which the new device gets as its cookie. */
  redeemTransfer(token: string): string {
    const transfer = this.transfers.get(token);
    this.transfers.delete(token);
    if (!transfer || transfer.expires <= this.options.now()) {
      throw new HttpError(404, "This link has expired or was already used", "transfer_invalid");
    }
    return transfer.sessionKey;
  }

  session(coder: Coder): SessionResponse {
    return {
      coderId: coder.coderId,
      jobId: this.spec.jobId,
      codebook: this.spec.codebook,
      version: this.spec.version,
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
    for (const [name] of this.autoVariables) {
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

  /** The pools of the first branch whose sources can produce `names`, if the codebook still has one. */
  private poolsFor(info: LoopInfo, names: string[]): UnitPool[] | null {
    const branch = info.loop.units.find(
      (b) => b.sources.length === names.length && b.sources.every((s, i) => unitsetMatchesSource(s.unitset, names[i])),
    );
    return branch ? branch.sources.map((s, i) => this.pool(info.loop.name, names[i], s.dynamic)) : null;
  }

  /** Pools the coder is already routed to for a loop (no new routing). */
  private assignedPools(coder: Coder, loop: string): UnitPool[] {
    const info = this.loops.get(loop);
    const names = coder.assignments[loop];
    if (!info || !names) return [];
    return this.poolsFor(info, names) ?? [];
  }

  /**
   * Routes a coder in a loop. The client evaluates the branch conditions
   * (they may use answers the server shouldn't need, docs/encryption.md)
   * and sends the chosen branch with its filled-in unitset names; the server
   * checks that the names fit that branch's sources and exist. A loop with a
   * single unconditional branch without references routes without a choice.
   * Sticky: stored with the coder, and reused as long as the codebook still
   * has a branch that produces the same unitsets (so a codebook update that
   * keeps it doesn't move coders around).
   */
  private async route(coder: Coder, info: LoopInfo, choice: BranchChoice): Promise<UnitPool[]> {
    const loop = info.loop;
    const stored = coder.assignments[loop.name];
    const existing = stored && this.poolsFor(info, stored);
    if (existing) return existing;

    let branchIndex = choice.branch;
    let names = choice.unitsets;
    if (branchIndex === undefined) {
      const only = loop.units.length === 1 ? loop.units[0] : undefined;
      if (!only || only.when || only.sources.some((s) => unitsetHasReferences(s.unitset))) {
        throw new HttpError(409, `Unit loop '${loop.name}': the client must choose a branch`, "branch_required");
      }
      branchIndex = 0;
      names = only.sources.map((s) => s.unitset);
    }
    const branch = loop.units[branchIndex];
    if (!branch) throw new HttpError(400, `Unit loop '${loop.name}' has no branch ${branchIndex}`);
    if (names.length !== branch.sources.length || branch.sources.some((s, i) => !unitsetMatchesSource(s.unitset, names[i]))) {
      throw new HttpError(400, `Unit loop '${loop.name}': unitsets [${names.join(", ")}] don't fit branch ${branchIndex}`);
    }
    const missing = names.find((name) => !this.unitsets.has(name));
    if (missing !== undefined) {
      throw new HttpError(409, `Unit loop '${loop.name}': unitset '${missing}' does not exist for this coder`);
    }

    coder.assignments = { ...coder.assignments, [loop.name]: names };
    await this.saveCoder(coder);
    return branch.sources.map((s, i) => this.pool(loop.name, names[i], s.dynamic));
  }

  // --- units ------------------------------------------------------------------

  async nextUnit(coder: Coder, loopName: string, choice: BranchChoice = { unitsets: [] }): Promise<CoderUnitResponse | null> {
    if (!this.spec.active) throw new HttpError(409, "This job is not active");
    const info = this.loops.get(loopName);
    if (!info) throw new HttpError(404, `No unit loop '${loopName}'`);
    const [pools, own] = await Promise.all([this.route(coder, info, choice), this.workspace(coder.coderId)]);

    for (;;) {
      const next = pickNext(pools, coder.coderId, this.codingsFor(loopName), {
        order: info.loop.order ?? "sequential",
        maxUnits: info.loop.maxUnits,
        seed: this.spec.jobId * 1000,
        now: this.options.now(),
      });
      if (!next) {
        this.workspaces.get(coder.coderId)?.exhausted.add(loopName);
        return null;
      }

      const upcoming = pools.flatMap((p) => p.candidates(coder.coderId, this.options.now(), null)).slice(0, this.options.prefetch);
      const units = await this.getUnits([next.unitId, ...upcoming.filter((id) => id !== next.unitId)]);
      const unit = units.get(next.unitId);
      if (!unit) {
        // It no longer exists: drop it everywhere and try the next one.
        this.removedUnits.add(next.unitId);
        for (const pool of this.pools.values()) pool.removeUnit(next.unitId);
        continue;
      }
      next.pool.take(coder.coderId, next.unitId, this.options.now());
      this.markServed(coder.coderId, unit);
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
    this.markServed(coder.coderId, unit);
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

    // Values of other variables (e.g. questions an update removed) are left
    // alone, so they stay as data. What the coder saw: normally the unit's
    // current hash, unless it changed after it was served (recorded, not refused).
    const unitHash = this.workspaces.get(coder.coderId)?.served.get(unitId) ?? this.units.get(unitId)?.unit.hash;
    await this.store.putAnnotation({ unitId, coderId: coder.coderId, variables, codebookId: this.spec.codebook.id, unitHash });
    const own = await this.workspace(coder.coderId);
    const previous = own.get(unitId);
    const merged = { ...previous, ...variables };
    own.set(unitId, merged);
    const entry = this.workspaces.get(coder.coderId);
    if (entry?.units === own) {
      const delta = sizeOf(merged) - (previous ? sizeOf(previous) : 0);
      entry.bytes += delta;
      this.workspaceBytes += delta;
      this.trimWorkspaces(coder.coderId);
    }
    this.recordFinished(coder.coderId, unitId, merged);
  }

  get version(): number {
    return this.spec.version;
  }

  /**
   * Progress per loop source. Computed on demand from the database (every
   * coder's finished units in every loop, and every coder's routing), since
   * the runtime only keeps global codings for dynamic loops and only active
   * coders.
   */
  async status(): Promise<DeploymentStatus> {
    const now = this.options.now();
    const [rows, allCoders] = await Promise.all([
      this.store.listFinished({
        loops: [...this.loops.values()].map((info) => ({
          loop: info.loop.name,
          variables: [...info.variables.keys()],
          values: loopAgreementVariables(info),
        })),
      }),
      this.store.listCoders(),
    ]);
    const finished = new Map<string, Codings>();
    for (const row of rows) {
      const info = this.loops.get(row.loop);
      if (!info || row.unitId === null) continue;
      if (!finished.has(row.loop)) finished.set(row.loop, new Codings());
      finished.get(row.loop)!.record(row.coderId, row.unitId, agreementKeys(row.values ?? {}, info));
    }

    const sources: DeploymentStatus["sources"] = [];
    for (const [loop] of this.loops) {
      const routed = allCoders.filter((c) => c.assignments[loop]);
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
      coders: allCoders.length,
      sources,
      loadedAt: new Date(this.loadedAt),
      memory: {
        units: this.units.size,
        unitBytes: this.unitBytes,
        coders: this.workspaces.size,
        coderBytes: this.workspaceBytes,
      },
    };
  }

  private markServed(coderId: number, unit: Unit): void {
    const entry = this.workspaces.get(coderId);
    if (!entry) return;
    if (!entry.served.has(unit.id)) {
      entry.bytes += SERVED_BYTES;
      this.workspaceBytes += SERVED_BYTES;
    }
    entry.served.set(unit.id, unit.hash);
  }

  /** Drops unit content from the cache: all of it, or these units. */
  clearUnits(ids: number[] | "all"): void {
    for (const id of ids === "all" ? [...this.units.keys()] : ids) this.dropUnit(id);
  }

  private dropUnit(id: number): void {
    const entry = this.units.get(id);
    if (!entry) return;
    this.units.delete(id);
    this.unitBytes -= entry.bytes;
  }

  /** Least recently used units first, until within budget. */
  private trimUnits(): void {
    for (const id of this.units.keys()) {
      if (this.unitBytes <= this.options.unitCacheBytes) return;
      this.dropUnit(id);
    }
  }

  /**
   * Done coders first, then the least recently active, until within budget.
   * Never the coder being served (`keep`): their codings must stay in place.
   */
  private trimWorkspaces(keep: number): void {
    if (this.workspaceBytes <= this.options.workspaceCacheBytes) return;
    const done = (w: WorkspaceEntry) => this.loops.size > 0 && [...this.loops.keys()].every((l) => w.exhausted.has(l));
    for (const pass of [done, () => true]) {
      for (const [id, entry] of this.workspaces) {
        if (this.workspaceBytes <= this.options.workspaceCacheBytes) return;
        if (id !== keep && pass(entry)) this.dropWorkspace(id);
      }
    }
  }

  /**
   * Forgets a coder's annotations, and what was derived from them: their
   * finished units in loops without dynamic sources (those keep global
   * codings). Reloaded from the database when the coder returns.
   */
  private dropWorkspace(coderId: number): void {
    const entry = this.workspaces.get(coderId);
    if (!entry) return;
    this.workspaces.delete(coderId);
    this.workspaceBytes -= entry.bytes;
    for (const [loop, codings] of this.codings) {
      const info = this.loops.get(loop);
      if (!info || !hasDynamicSources(info)) codings.forget(coderId);
    }
  }

  /** Applies the idle limit, and drops coders whose workspace is gone. */
  private evictExpired(): void {
    const now = this.options.now();
    for (const [id, { usedAt }] of this.units) if (now - usedAt >= this.options.maxIdleMs) this.dropUnit(id);
    for (const [id, { usedAt }] of this.workspaces) if (now - usedAt >= this.options.maxIdleMs) this.dropWorkspace(id);
    // Coders go with their workspace; they are resolved again when they come back.
    for (const id of this.coders.keys()) {
      if (!this.workspaces.has(id) && !this.workspaceLoads.has(id)) this.coders.delete(id);
    }
    for (const [key, id] of this.coderKeys) if (!this.coders.has(id)) this.coderKeys.delete(key);
  }

  private async getUnits(ids: number[]): Promise<Map<number, Unit>> {
    const now = this.options.now();
    const result = new Map<number, Unit>();
    const missing: number[] = [];
    for (const id of ids) {
      const cached = this.units.get(id);
      if (!cached) {
        missing.push(id);
        continue;
      }
      cached.usedAt = now;
      this.units.delete(id); // move to the most recent end
      this.units.set(id, cached);
      result.set(id, cached.unit);
    }
    // Only go to the database if the unit actually asked for is missing;
    // prefetch candidates ride along with that request.
    if (missing.includes(ids[0])) {
      for (const unit of await this.store.getUnits(missing)) {
        this.dropUnit(unit.id);
        const bytes = sizeOf(unit);
        this.units.set(unit.id, { unit, bytes, usedAt: now });
        this.unitBytes += bytes;
        result.set(unit.id, unit);
      }
      this.trimUnits();
    }
    return result;
  }
}

function agreementKeys(variables: Record<string, VariableValue>, info: LoopInfo): AgreementKeys {
  return Object.fromEntries(loopAgreementVariables(info).map((v) => [v, agreementKey(variables, v)]));
}
