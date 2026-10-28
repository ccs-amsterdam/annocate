import {
  SET_ACTIVITY_MS,
  shownUnitFields,
  type UnitData,
  branchFingerprint,
  branchUnitsets,
  loopTitle,
  sharedDefaults,
  unitsetHasReferences,
  unitsetMatchesSource,
  type CoderUnitResponse,
  type DeploymentStatus,
  type EndUnit,
  type SessionResponse,
  type UnitBranch,
  type TransferResponse,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { unitHash } from "../shared/units.js";
import { Codings, UnitPool, pickNext, type AgreementKeys, type OverlapPlacement, type SharedRule } from "./distribution.js";
import type { Store } from "./store.js";
import type { Coder, DeploymentSpec, ResolveCoderRequest, Unit } from "./types.js";
import {
  agreementKey,
  singleValue,
  codingsSignature,
  collectCoderVariables,
  collectLoops,
  findEndItem,
  finishedLoops,
  loopAgreementVariables,
  needsAllCodings,
  validateVariables,
  variableValues,
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

/** Where a coder is routed in a loop: the branch, their own pool, and the overlap. */
interface Routed {
  branch: UnitBranch;
  main: UnitPool;
  overlap: OverlapPlacement | null;
}

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
  /** unitId -> the unit version last shown to the coder, stored with their answers. */
  served: Map<number, number>;
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
  /** loop key -> finished codings in that loop. */
  private codings = new Map<string, Codings>();
  /** `codingsSignature` of the spec the codings were derived under. */
  private codingsBasis = "";
  /** Annotations written while `loadCodings` is fetching, replayed onto its result. */
  private pendingCodings: [coderId: number, variables: Record<string, VariableValue>, unitId: number][] | null = null;
  /** `<loop>/<unitset>/<shared rule>` -> pool, created when the first coder is routed to it. */
  private pools = new Map<string, UnitPool>();
  /** The unit fields the codebook shows (`shownUnitFields`): all coders get. */
  private shownFields: string[] = [];
  /** unitId -> the unit as shown under this codebook, and its version (`shownVersion`). */
  private shown = new Map<number, { content: string; data: UnitData; versionId: number }>();
  /** Loops with `sets` branches: coderId -> their set and when they were routed, for every coder. */
  private setAssignments = new Map<string, Map<number, { set: string; at: number }>>();
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
    await Promise.all([this.loadCodings(), this.loadBalanced(), this.loadSetAssignments()]);
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
          this.applyUnitsets(spec);
          return;
        }
        const epochChanged = spec.annotationEpoch !== this.spec.annotationEpoch;
        const balancedBefore = this.balancedVariables().join();
        this.applySpec(spec);
        await Promise.all([
          epochChanged || codingsSignature(this.loops.values()) !== this.codingsBasis ? this.loadCodings() : null,
          this.balancedVariables().join() !== balancedBefore ? this.loadBalanced() : null,
          this.loadSetAssignments(),
        ]);
      } finally {
        this.refreshing = null;
      }
    })();
    await this.refreshing;
  }

  /**
   * Unitsets (and all units) change without a new codebook version: units
   * uploaded, sets made or edited after publishing. Pools of a changed set
   * start again from it (their leases are dropped: disposable, §3).
   */
  private applyUnitsets(spec: DeploymentSpec): void {
    const next = new Map(spec.unitsets.map((u) => [u.name, u.unitIds]));
    const changed = new Set([...next.keys(), ...this.unitsets.keys()].filter((name) => next.get(name)?.join() !== this.unitsets.get(name)?.join()));
    this.spec = { ...this.spec, unitsets: spec.unitsets };
    if (changed.size === 0) return;
    this.unitsets = next;
    for (const [key, pool] of this.pools) if (changed.has(pool.unitset)) this.pools.delete(key);
  }

  private applySpec(spec: DeploymentSpec): void {
    this.spec = spec;
    this.specCheckedAt = this.options.now();
    const items = spec.codebook.items as TopLevelItem[];
    this.loops = new Map(collectLoops(items).map((l) => [l.key, l]));
    this.coderVariableTypes = collectCoderVariables(items);
    this.autoVariables = [...this.coderVariableTypes].filter((e): e is [string, AutoVariable] => e[1].type === "auto");
    this.unitsets = new Map(spec.unitsets.map((u) => [u.name, u.unitIds]));
    this.shownFields = shownUnitFields(items);
    this.shown.clear();
    this.pools.clear();
    this.removedUnits.clear();
  }

  /**
   * Rebuilds the codings: every coder's finished units for loops with
   * shared queues or sets (global state those need), and drops the
   * workspaces, so other loops' codings are rebuilt per coder when they
   * show up.
   */
  private async loadCodings(): Promise<void> {
    const dynamicLoops = [...this.loops.values()].filter(needsAllCodings);
    const pending: NonNullable<typeof this.pendingCodings> = [];
    this.pendingCodings = pending;
    try {
      const rows = await this.store.listFinished({
        loops: dynamicLoops.map((info) => ({
          loop: info.key,
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
          this.codingsFor(row.loop).record(row.coderId, row.unitId, agreementKeys(row.values ?? {}, info), row.created.getTime());
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
      const code = variableValues(row.values ?? {})[row.loop];
      if (code !== undefined) balanced.get(row.loop)?.set(row.coderId, code);
    }
    this.balanced = balanced;
  }

  /** Records the coder's options for `balanced` variables. */
  private countBalanced(coder: Coder): void {
    const codes = variableValues(coder.variables);
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
  private recordFinished(coderId: number, unitId: number, variables: Record<string, VariableValue>, at = this.options.now()): void {
    for (const info of finishedLoops(variables, this.loops.values())) {
      this.codingsFor(info.key).record(coderId, unitId, agreementKeys(variables, info), at);
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
          for (const a of annotations) this.recordFinished(coderId, a.unitId, a.variables, a.updated.getTime());
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
      if (variableValues(coder.variables)[name] !== undefined) continue;
      if (variable.source === "url_param") {
        const value = urlParams[variable.urlParam ?? name];
        // A value outside the codebook's options (if it lists any) is ignored, not stored.
        if (value === undefined || value.length > 200 || (variable.options?.length && !variable.options.some((o) => o.value === value))) continue;
        coder.variables = { ...coder.variables, [name]: singleValue(value) };
        changed = true;
        continue;
      }
      const method = variable.source === "invite" ? variable.fallback : variable.source;
      if (method !== "random" && method !== "balanced") continue;
      const options = variable.options ?? [];
      if (options.length === 0) continue;
      const code = method === "random" ? this.drawWeighted(options) : this.leastUsed(name, options);
      coder.variables = { ...coder.variables, [name]: singleValue(code) };
      changed = true;
    }
    if (changed) {
      this.countBalanced(coder);
      await this.saveCoder(coder);
    }
  }

  private drawWeighted(options: { value: string; weight?: number }[]): string {
    const total = options.reduce((n, o) => n + (o.weight ?? 1), 0);
    let r = this.options.random() * total;
    for (const o of options) {
      r -= o.weight ?? 1;
      if (r < 0) return o.value;
    }
    return options[options.length - 1].value;
  }

  private leastUsed(name: string, options: { value: string }[]): string {
    const counts = new Map(options.map((o) => [o.value, 0]));
    for (const value of this.balanced.get(name)?.values() ?? []) {
      if (counts.has(value)) counts.set(value, counts.get(value)! + 1);
    }
    return options.reduce((best, o) => (counts.get(o.value)! < counts.get(best.value)! ? o : best)).value;
  }

  private async saveCoder(coder: Coder): Promise<void> {
    await this.store.putCoder(coder.coderId, { variables: coder.variables, assignments: coder.assignments, ended: coder.ended });
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
        const routed = this.assignedPools(coder, info.key);
        const pools = DeploymentRuntime.poolsOf(routed);
        return {
          unitset: info.key,
          doneUnitIds: this.codingsFor(info.key).doneBy(coder.coderId).filter((id) => pools.some((p) => p.has(id))),
          totalUnits: this.expectedUnits(routed),
        };
      }),
      variables: coder.variables,
      ended: coder.ended,
      deletionRequest: coder.deletionRequest,
      session: coder.session,
    };
  }

  /**
   * The coder reached an `end` item: the session is over (screened out or
   * complete), and nothing more is accepted. Its outcome comes from the
   * codebook. Reaching it again (e.g. after a reload) changes nothing. An
   * end inside a unit loop names the unit (one the coder answered), so the
   * ending can be shown again with its values.
   */
  async endSession(coder: Coder, item: string, unit?: EndUnit): Promise<void> {
    if (coder.ended) return;
    const end = findEndItem(this.spec.codebook.items, item);
    if (!end) throw new HttpError(400, `No end item '${item}'`);
    if (unit && (!this.loops.has(unit.loop) || !(await this.workspace(coder.coderId)).has(unit.id))) {
      throw new HttpError(400, "The end's unit is not one you answered");
    }
    coder.ended = { item, ...(unit ? { unit } : {}), outcome: end.outcome, at: new Date(this.options.now()) };
    await this.saveCoder(coder);
  }

  /**
   * The coder quits: the session ends (if it hadn't: an ending at an `end`
   * item stays). With `requestDeletion` they ask for their answers to be
   * deleted, also after the session ended; the researcher decides.
   */
  async quitSession(coder: Coder, requestDeletion: boolean): Promise<void> {
    const at = new Date(this.options.now());
    if (!coder.ended) {
      coder.ended = { outcome: "quit", at };
      await this.saveCoder(coder);
    }
    if (requestDeletion) {
      coder.deletionRequest = { at };
      await this.store.requestDeletion(coder.coderId, coder.deletionRequest);
    }
  }

  private assertOpen(coder: Coder): void {
    if (coder.ended) throw new HttpError(409, "This session has ended", "session_ended");
  }

  /** Coder-level answers. Server-assigned auto variables can't be overwritten by the client. */
  async submitCoderVariables(coder: Coder, variables: Record<string, VariableValue>): Promise<void> {
    this.assertOpen(coder);
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
  private expectedUnits(routed: Routed | null): number | null {
    if (!routed) return null;
    const { branch, main, overlap } = routed;
    const own = branch.mode === "shared" ? (branch.maxUnits === undefined ? null : Math.min(branch.maxUnits, main.size)) : main.size;
    return own === null ? null : own + (overlap?.pool.size ?? 0);
  }

  // --- routing ----------------------------------------------------------------

  private pool(loop: string, unitset: string, rule: SharedRule | null): UnitPool {
    const key = `${loop}/${unitset}/${JSON.stringify(rule)}`;
    let pool = this.pools.get(key);
    if (!pool) {
      const unitIds = (this.unitsets.get(unitset) ?? []).filter((id) => !this.removedUnits.has(id));
      this.pools.set(key, (pool = new UnitPool(unitset, unitIds, rule, this.codingsFor(loop))));
    }
    return pool;
  }

  /** A branch's pools for these unitset names (in `branchUnitsets` order). */
  private routed(loop: string, branch: UnitBranch, names: string[]): Routed {
    const main = this.pool(loop, names[0], branch.mode === "shared" ? sharedDefaults(branch) : null);
    const overlap = branch.overlap
      ? { pool: this.pool(loop, names[1], null), placement: branch.overlap.placement ?? ("before" as const) }
      : null;
    return { branch, main, overlap };
  }

  /** Whether unitset names fit a branch: its templates, and in `sets` mode one of its sets. */
  private static fits(branch: UnitBranch, names: string[]): boolean {
    const templates = branchUnitsets(branch);
    if (names.length !== templates.length) return false;
    if (branch.mode === "sets" && !branch.unitsets.includes(names[0])) return false;
    return templates.every((t, i) => t === null || unitsetMatchesSource(t, names[i]));
  }

  /**
   * Where the coder is already routed in a loop (no new routing): the first
   * branch with a stored routing (by `branchFingerprint`) whose unitsets
   * still fit it.
   */
  private assignedPools(coder: Coder, loop: string): Routed | null {
    const info = this.loops.get(loop);
    if (!info) return null;
    for (const branch of info.loop.units) {
      const assignment = coder.assignments[branchFingerprint(branch)];
      if (assignment && DeploymentRuntime.fits(branch, assignment.unitsets)) return this.routed(info.key, branch, assignment.unitsets);
    }
    return null;
  }

  /** The pools of a routing, own set first. */
  private static poolsOf(routed: Routed | null): UnitPool[] {
    return routed ? [routed.main, ...(routed.overlap ? [routed.overlap.pool] : [])] : [];
  }

  /**
   * Routes a coder in a loop. The client evaluates the branch conditions
   * (they may use answers the server shouldn't need, docs/encryption.md)
   * and sends the chosen branch with its filled-in unitset names; the server
   * checks that the names fit that branch and exist. It picks the coder's
   * set itself in `sets` mode (the one with the fewest coders) and
   * `invitation` mode (their invite's). A loop with a single unconditional
   * branch without references routes without a choice. Sticky: stored with
   * the coder, and reused as long as the codebook still has a branch that
   * produces the same unitsets (so a codebook update that keeps it doesn't
   * move coders around). Null if the coder gets no units here (an
   * invitation without units; tried again next time).
   */
  private async route(coder: Coder, info: LoopInfo, choice: BranchChoice): Promise<Routed | null> {
    const loop = info.loop;
    const title = loopTitle(loop, info.key);
    const existing = this.assignedPools(coder, info.key);
    if (existing) return existing;

    let branchIndex = choice.branch;
    let names = choice.unitsets;
    if (branchIndex === undefined) {
      const only = loop.units.length === 1 ? loop.units[0] : undefined;
      if (!only || only.when || branchUnitsets(only).some((t) => t !== null && unitsetHasReferences(t))) {
        throw new HttpError(409, `${title}: the client must choose a branch`, "branch_required");
      }
      branchIndex = 0;
      names = branchUnitsets(only).map((t) => t ?? "");
    }
    const branch = loop.units[branchIndex];
    if (!branch) throw new HttpError(400, `${title} has no branch ${branchIndex}`);
    const templates = branchUnitsets(branch);
    if (names.length !== templates.length || templates.some((t, i) => t !== null && !unitsetMatchesSource(t, names[i]))) {
      throw new HttpError(400, `${title}: unitsets [${names.join(", ")}] don't fit branch ${branchIndex}`);
    }
    names = [...names];
    if (branch.mode === "sets") names[0] = this.leastCodedSet(info.key, branch.unitsets);
    if (branch.mode === "invitation") {
      const own = await this.store.inviteUnitset(coder.inviteId ?? "first");
      if (own === null) return null;
      names[0] = own;
    }
    const missing = names.find((name) => !this.unitsets.has(name));
    if (missing !== undefined) {
      throw new HttpError(409, `${title}: unitset '${missing}' does not exist for this coder`);
    }

    const at = this.options.now();
    coder.assignments = { ...coder.assignments, [branchFingerprint(branch)]: { unitsets: names, at } };
    await this.saveCoder(coder);
    if (branch.mode === "sets") this.setCoders(info.key).set(coder.coderId, { set: names[0], at });
    return this.routed(info.key, branch, names);
  }

  private setCoders(loop: string): Map<number, { set: string; at: number }> {
    let coders = this.setAssignments.get(loop);
    if (!coders) this.setAssignments.set(loop, (coders = new Map()));
    return coders;
  }

  /**
   * The set with the fewest coders (the first of those), counting a coder
   * for their set if they finished it, or were routed or finished a unit in
   * the last 24 hours (contracts SET_ACTIVITY_MS): sets of coders who
   * dropped out are handed out again.
   */
  private leastCodedSet(loop: string, sets: string[]): string {
    const now = this.options.now();
    const codings = this.codingsFor(loop);
    const counts = new Map(sets.map((s) => [s, 0]));
    for (const [coderId, { set, at }] of this.setCoders(loop)) {
      if (!counts.has(set)) continue;
      const active = now - Math.max(at, codings.lastFinished(coderId)) < SET_ACTIVITY_MS;
      const finished = (this.unitsets.get(set) ?? []).every((id) => codings.has(coderId, id));
      if (active || finished) counts.set(set, counts.get(set)! + 1);
    }
    return sets.reduce((best, s) => (counts.get(s)! < counts.get(best)! ? s : best));
  }

  /** Which coder has which set, in loops with `sets` branches (every coder, not only active ones). */
  private async loadSetAssignments(): Promise<void> {
    const loops = [...this.loops.values()].filter((info) => info.loop.units.some((b) => b.mode === "sets"));
    this.setAssignments = new Map();
    if (loops.length === 0) return;
    for (const coder of await this.store.listCoders()) {
      for (const info of loops) {
        const routed = this.assignedPools(coder, info.key);
        const assignment = routed && coder.assignments[branchFingerprint(routed.branch)];
        if (routed?.branch.mode === "sets" && assignment) this.setCoders(info.key).set(coder.coderId, { set: assignment.unitsets[0], at: assignment.at });
      }
    }
  }

  // --- units ------------------------------------------------------------------

  async nextUnit(coder: Coder, loopName: string, choice: BranchChoice = { unitsets: [] }): Promise<CoderUnitResponse | null> {
    this.assertOpen(coder);
    if (!this.spec.active) throw new HttpError(409, "This job is not active");
    const info = this.loops.get(loopName);
    if (!info) throw new HttpError(404, `No unit loop '${loopName}'`);
    const [routed, own] = await Promise.all([this.route(coder, info, choice), this.workspace(coder.coderId)]);
    if (!routed) return null;
    const pools = DeploymentRuntime.poolsOf(routed);

    for (;;) {
      const next = pickNext(routed.main, routed.overlap, coder.coderId, this.codingsFor(loopName), {
        order: info.loop.order ?? "sequential",
        maxUnits: routed.branch.mode === "shared" ? routed.branch.maxUnits : undefined,
        minUnits: routed.branch.mode === "shared" ? routed.branch.minUnits : undefined,
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
      const shown = await this.markServed(coder.coderId, unit);
      return {
        id: unit.id,
        externalId: unit.externalId,
        data: shown.data,
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
    const pools = DeploymentRuntime.poolsOf(this.assignedPools(coder, loopName));
    // Only units the coder has worked on (or holds right now): no peeking ahead.
    if (!pools.some((p) => p.has(unitId) && (own !== undefined || p.heldLease(coder.coderId) === unitId))) {
      throw new HttpError(404, "This unit is not part of your session");
    }
    const unit = (await this.getUnits([unitId])).get(unitId);
    if (!unit) throw new HttpError(404, "Unit not found");
    const shown = await this.markServed(coder.coderId, unit);
    return { id: unit.id, externalId: unit.externalId, data: shown.data, variables: own ?? {} };
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
    this.assertOpen(coder);
    const loops = [...this.loops.values()].filter(
      (info) =>
        (loopName === undefined || info.key === loopName) &&
        DeploymentRuntime.poolsOf(this.assignedPools(coder, info.key)).some((p) => p.canSubmit(coder.coderId, unitId)),
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
    // alone, so they stay as data. With them: the unit version the coder
    // saw (which may be older than the unit's content now).
    let unitVersionId = this.workspaces.get(coder.coderId)?.served.get(unitId);
    if (unitVersionId === undefined) {
      const unit = (await this.getUnits([unitId])).get(unitId);
      unitVersionId = unit && (await this.shownVersion(unit)).versionId;
    }
    await this.store.putAnnotation({ unitId, coderId: coder.coderId, variables, codebookId: this.spec.codebook.id, unitVersionId });
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
          loop: info.key,
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
      const routed = allCoders.filter((c) => this.assignedPools(c, loop) !== null);
      const seen = new Set<UnitPool>();
      for (const coder of routed) {
        for (const pool of DeploymentRuntime.poolsOf(this.assignedPools(coder, loop))) {
          if (seen.has(pool)) continue;
          seen.add(pool);
          const coders = routed.filter((c) => DeploymentRuntime.poolsOf(this.assignedPools(c, loop)).includes(pool)).map((c) => c.coderId);
          const counted = new UnitPool(pool.unitset, [...pool.unitIds], pool.rule, finished.get(loop) ?? new Codings());
          sources.push({
            loop: loopTitle(this.loops.get(loop)!.loop, loop),
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

  /**
   * A unit as coders see it under this codebook (docs/architecture.md
   * §8.4): only the fields it uses (`shownUnitFields`), and the id of that
   * unit version, stored the first time it is shown. Both are remembered
   * until the unit or the codebook changes.
   */
  private async shownVersion(unit: Unit): Promise<{ data: UnitData; versionId: number }> {
    const cached = this.shown.get(unit.id);
    if (cached && cached.content === unit.hash) return cached;
    const data: UnitData = Object.fromEntries(this.shownFields.filter((f) => f in unit.data).map((f) => [f, unit.data[f]]));
    const versionId = await this.store.unitVersion(unit.id, unitHash(unit.externalId, data), data);
    const entry = { content: unit.hash, data, versionId };
    this.shown.set(unit.id, entry);
    return entry;
  }

  /** Records which version of a unit the coder was shown; returns it. */
  private async markServed(coderId: number, unit: Unit): Promise<{ data: UnitData; versionId: number }> {
    const shown = await this.shownVersion(unit);
    const entry = this.workspaces.get(coderId);
    if (!entry) return shown;
    if (!entry.served.has(unit.id)) {
      entry.bytes += SERVED_BYTES;
      this.workspaceBytes += SERVED_BYTES;
    }
    entry.served.set(unit.id, shown.versionId);
    return shown;
  }

  /** Drops unit content from the cache: all of it, or these units. */
  clearUnits(ids: number[] | "all"): void {
    for (const id of ids === "all" ? [...this.units.keys()] : ids) this.dropUnit(id);
  }

  private dropUnit(id: number): void {
    this.shown.delete(id);
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
      if (!info || !needsAllCodings(info)) codings.forget(coderId);
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
