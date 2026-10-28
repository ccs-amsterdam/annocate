import {
  type AnswerTiming,
  SET_ACTIVITY_MS,
  shownUnitFields,
  type UnitData,
  branchFingerprint,
  branchUnitsets,
  loopDependencies,
  loopTitle,
  sharedDefaults,
  unitsetHasReferences,
  unitsetMatchesSource,
  type CoderUnitResponse,
  type DeploymentStatus,
  type EndUnit,
  type EndValues,
  type Reopen,
  type SessionResponse,
  type UnitBranch,
  type TransferResponse,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { unitHash } from "../shared/units.js";
import { Codings, UnitPool, pickNext, type AgreementKeys, type OverlapPlacement } from "./distribution.js";
import type { Store } from "./store.js";
import type { DeviceDetails } from "../shared/devices.js";
import type { Coder, CoderValue, Coding, DeploymentSpec, Lease, ResolveCoderRequest, ResolvedCoder, Unit } from "./types.js";
import {
  agreementKey,
  singleValue,
  codingsSignature,
  collectCoderVariables,
  collectLoops,
  findEndItem,
  finishedLoops,
  loopAgreementVariables,
  validateVariables,
  valueOf,
  type LoopInfo,
  type VariableType,
} from "./codebook.js";

/** Stored coder-level answers as plain values. */
const plainValues = (values: Record<string, CoderValue>) => Object.fromEntries(Object.entries(values).map(([name, v]) => [name, v.value]));

/** The branch of a loop the client chose (`GET /loop/:loop/next?branch=&unitsets=`), see contracts NextUnitQuerySchema. */
export interface BranchChoice {
  branch?: number;
  unitsets: string[];
}

export interface RuntimeOptions {
  /** How long a "continue on another device" link stays valid. */
  transferTtlMs: number;
  /** A loaded deployment nobody used for this long is dropped (registry.ts). */
  deploymentIdleMs: number;
  now: () => number;
  random: () => number;
}

export const DEFAULT_RUNTIME_OPTIONS: RuntimeOptions = {
  transferTtlMs: 15 * 60_000,
  deploymentIdleMs: 6 * 60 * 60_000,
  now: () => Date.now(),
  random: Math.random,
};

export type { Coder };

/** Where a coder is routed in a loop: the branch and its unitset names (`branchUnitsets` order: own set, overlap). */
interface Route {
  branch: UnitBranch;
  names: string[];
}

/** A route's pools, with the state they were loaded with. */
interface Routed {
  branch: UnitBranch;
  main: UnitPool;
  overlap: OverlapPlacement | null;
}

type AutoVariable = Extract<VariableType, { type: "auto" }>;

/** How long a coder can go back after completing a session (docs/coder-identity.md §9). */
export const REOPEN_MS = 15 * 60 * 1000;

/**
 * The coder runtime of one deployed job (docs/plan-stateless-runtime.md).
 * Everything it works with is in the database and read per request: the
 * coder, their answers, units, finished codings (`unit_codings`) and the
 * leases of shared queues (`unit_leases`). Decisions that count other
 * coders (a shared queue's next unit, a set, a balanced group) run under a
 * database lock (`Store.locked`), so any number of server processes can
 * serve the same job. In memory only the deployment spec, re-read when its
 * stamp changes.
 *
 * "Finished" is always relative to the current codebook: every question of
 * the loop has a live value (docs/architecture.md §8.2). Codings are kept
 * per loop, so a unit in two loops is finished in each separately; they
 * are rebuilt from the answers when what finishes a loop changes
 * (`codingsBasis`).
 */
export class DeploymentRuntime {
  private spec!: DeploymentSpec;
  private loops = new Map<string, LoopInfo>();
  private coderVariableTypes = new Map<string, VariableType>();
  /** Loop key -> the coder-level questions it depends on (`loopDependencies`), frozen once a coder coded a unit there. */
  private dependencies = new Map<string, string[]>();
  private autoVariables: [string, AutoVariable][] = [];
  private unitsets = new Map<string, number[]>();
  /** The unit fields the codebook shows (`shownUnitFields`): all coders get. */
  private shownFields: string[] = [];
  /** The deployment's stamp when the spec was read (`Store.deploymentStamp`). */
  private stamp: string | null = null;
  private loadedAt = 0;
  private refreshing: Promise<void> | null = null;

  constructor(
    readonly id: string,
    private store: Store,
    private options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
  ) {}

  // --- state ------------------------------------------------------------------

  /** Reads the deployment, and makes sure the finished codings fit its codebook. */
  async load(): Promise<void> {
    const stamp = await this.store.deploymentStamp();
    this.applySpec(await this.store.getDeployment());
    await this.ensureCodings();
    this.stamp = stamp;
    this.loadedAt = this.options.now();
  }

  /**
   * Checks the deployment's stamp (one small query, every request), and if
   * it changed re-reads the spec. Single-flight.
   */
  async refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        const stamp = await this.store.deploymentStamp();
        if (stamp !== null && stamp === this.stamp) return;
        const spec = await this.store.getDeployment();
        if (spec.version !== this.spec.version || spec.annotationEpoch !== this.spec.annotationEpoch) {
          this.applySpec(spec);
          await this.ensureCodings();
        } else {
          this.spec = { ...this.spec, active: spec.active, keepSessionsOpen: spec.keepSessionsOpen, unitsets: spec.unitsets };
          this.unitsets = new Map(spec.unitsets.map((u) => [u.name, u.unitIds]));
        }
        // Only once read: a failed read (e.g. a suspended job) is tried again next time.
        this.stamp = stamp;
      } finally {
        this.refreshing = null;
      }
    })();
    await this.refreshing;
  }

  private applySpec(spec: DeploymentSpec): void {
    this.spec = spec;
    const items = spec.codebook.items as TopLevelItem[];
    this.loops = new Map(collectLoops(items).map((l) => [l.key, l]));
    this.coderVariableTypes = collectCoderVariables(items);
    this.dependencies = new Map(
      [...loopDependencies(items)].map(([key, names]) => [key, names.filter((name) => this.coderVariableTypes.has(name))]),
    );
    this.autoVariables = [...this.coderVariableTypes].filter((e): e is [string, AutoVariable] => e[1].type === "auto");
    this.unitsets = new Map(spec.unitsets.map((u) => [u.name, u.unitIds]));
    this.shownFields = shownUnitFields(items);
  }

  /** What finishes a loop under this codebook (its questions and agreement questions), and the annotation epoch. */
  private get codingsBasis(): string {
    return `${codingsSignature(this.loops.values())}/${this.spec.annotationEpoch}`;
  }

  /**
   * The stored codings (`unit_codings`) are derived from the answers under a
   * codebook. If that changed (loops gained questions, other agreement
   * questions) or answers were reset, they are derived again, once: the
   * first process to get the lock does it.
   */
  private async ensureCodings(): Promise<void> {
    const basis = this.codingsBasis;
    if ((await this.store.codingsBasis()) === basis) return;
    await this.store.locked("codings", async (store) => {
      if ((await store.codingsBasis()) === basis) return;
      const rows = await store.listFinished({
        loops: [...this.loops.values()].map((info) => ({ loop: info.key, variables: [...info.variables.keys()], values: loopAgreementVariables(info) })),
      });
      const codings = rows.flatMap((row): Coding[] => {
        const info = this.loops.get(row.loop);
        if (!info || row.unitId === null) return [];
        return [{ loop: row.loop, unitId: row.unitId, coderId: row.coderId, agreement: agreementKeys(row.values ?? {}, info), created: row.created, updated: row.created }];
      });
      await store.replaceCodings(basis, codings);
    });
  }

  /** Finished codings as distribution reads them. */
  private static codingsOf(rows: Coding[]): Codings {
    const codings = new Codings();
    for (const row of rows) codings.record(row.coderId, row.unitId, row.agreement, new Date(row.updated).getTime());
    return codings;
  }

  // --- coders -----------------------------------------------------------------

  /**
   * The coder for a coder key, created on first use (from the invite, with
   * participant id / new-session confirmation, see docs/coder-identity.md).
   * Read from the database on every request: one indexed query.
   */
  resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    return this.store.resolveCoder(request);
  }

  /**
   * Assigns server-side `auto` variables (random / balanced / invite
   * fallback / URL parameter) the coder doesn't have yet, into `values` (the
   * coder's answers as stored). Once assigned they never change. Saved
   * before the coder is answered. Done when the session is loaded
   * (`session`): the client loads it before anything else, and again after
   * a new codebook version, which may have new `auto` questions. A
   * `balanced` one is chosen under a lock, counting every coder's value.
   */
  private async assignAutoVariables(coder: Coder, values: Record<string, CoderValue>, urlParams: Record<string, string>): Promise<void> {
    const assigned: Record<string, VariableValue> = {};
    const balanced: [string, { value: string }[]][] = [];
    for (const [name, variable] of this.autoVariables) {
      if (values[name] !== undefined) continue;
      if (variable.source === "url_param") {
        const value = urlParams[variable.urlParam ?? name];
        // A value outside the codebook's options (if it lists any) is ignored, not stored.
        if (value === undefined || value.length > 200 || (variable.options?.length && !variable.options.some((o) => o.value === value))) continue;
        assigned[name] = singleValue(value);
        continue;
      }
      const method = variable.source === "invite" ? variable.fallback : variable.source;
      const options = variable.options ?? [];
      if (options.length === 0) continue;
      if (method === "random") assigned[name] = singleValue(this.drawWeighted(options));
      if (method === "balanced") balanced.push([name, options]);
    }
    const put = (store: Store, write: Record<string, VariableValue>) =>
      store.putCoderValues({ coderId: coder.coderId, values: write, assigned: true, codebookId: this.spec.codebook.id });
    if (Object.keys(assigned).length > 0) await put(this.store, assigned);
    for (const [name, options] of balanced) {
      assigned[name] = await this.store.locked(`balanced/${name}`, async (store) => {
        const value = singleValue(DeploymentRuntime.leastUsed(options, await store.coderValuesOf(name)));
        await put(store, { [name]: value });
        return value;
      });
    }
    for (const [name, value] of Object.entries(assigned)) values[name] = { value, assigned: true, frozen: false };
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

  /** The option the fewest coders have (the first of those). */
  private static leastUsed(options: { value: string }[], taken: VariableValue[]): string {
    const counts = new Map(options.map((o) => [o.value, 0]));
    for (const answer of taken) {
      const value = valueOf(answer);
      if (value !== undefined && counts.has(value)) counts.set(value, counts.get(value)! + 1);
    }
    return options.reduce((best, o) => (counts.get(o.value)! < counts.get(best.value)! ? o : best)).value;
  }

  /** A one-time token that lets another device continue this coder's session (docs/coder-identity.md §4). */
  async createTransfer(coder: Coder): Promise<TransferResponse> {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expires = new Date(this.options.now() + this.options.transferTtlMs);
    await this.store.createTransfer(await sha256(token), { coderId: coder.coderId, participant: coder.session.participant ?? null, expires });
    return { token, expiresAt: expires };
  }

  /**
   * Redeems a transfer token (once): the new device joins the session, with
   * its keys for it (`keys`, from the session's participant id: coder.ts).
   */
  async redeemTransfer(token: string, keys: (participantId: string | null) => Promise<string[]>, device: DeviceDetails): Promise<void> {
    const transfer = await this.store.redeemTransfer(await sha256(token), new Date(this.options.now()));
    if (!transfer) throw new HttpError(404, "This link has expired or was already used", "transfer_invalid");
    for (const key of await keys(transfer.participant)) await this.store.addDevice(transfer.coderId, key, device);
  }

  /**
   * The session for the client. `urlParams`: the page's query parameters,
   * for `url_param` auto variables (stored now, so the coder can come back
   * without them).
   */
  async session(coder: Coder, urlParams: Record<string, string> = {}): Promise<SessionResponse> {
    const values = await this.store.coderValues(coder.coderId);
    if (!coder.ended && this.autoVariables.length > 0) await this.assignAutoVariables(coder, values, urlParams);
    const [endValues, codings] = await Promise.all([this.endValues(coder, values), this.store.listCodings({ coderId: coder.coderId })]);
    return {
      coderId: coder.coderId,
      jobId: this.spec.jobId,
      codebook: this.spec.codebook,
      version: this.spec.version,
      progress: [...this.loops.values()].map((info) => {
        const route = this.assignedRoute(coder, info.key);
        const units = this.routeUnits(route);
        return {
          unitset: info.key,
          doneUnitIds: codings.filter((c) => c.loop === info.key && units.has(c.unitId)).map((c) => c.unitId),
          totalUnits: this.expectedUnits(route),
        };
      }),
      // A closed session: only what its end screen shows.
      variables: this.closed(coder) ? (endValues?.variables ?? {}) : plainValues(values),
      frozen: this.closed(coder) ? [] : Object.keys(values).filter((name) => values[name].frozen),
      ended: coder.ended,
      endValues,
      reopen: this.reopen(coder),
      deletionRequest: coder.deletionRequest,
      session: coder.session,
      login: coder.email,
    };
  }

  /**
   * The coder reached an `end` item: the session is over (screened out or
   * complete), and nothing more is accepted. Its outcome comes from the
   * codebook. Reaching it again (e.g. after a reload) changes nothing. An
   * end inside a unit loop names the unit (one the coder answered), so the
   * ending can be shown again with its values.
   */
  async endSession(coder: Coder, item?: string, unit?: EndUnit): Promise<{ reopen: Reopen }> {
    if (coder.ended) return { reopen: this.reopen(coder) };
    // Without an item: the coder went through the whole job.
    const end = item === undefined ? null : findEndItem(this.spec.codebook.items, item);
    if (item !== undefined && !end) throw new HttpError(400, `No end item '${item}'`);
    if (unit && (!this.loops.has(unit.loop) || Object.keys(await this.store.unitAnswers(coder.coderId, unit.id)).length === 0)) {
      throw new HttpError(400, "The end's unit is not one you answered");
    }
    coder.ended = { ...(item ? { item } : {}), ...(unit ? { unit } : {}), outcome: end?.outcome ?? "complete", at: new Date(this.options.now()) };
    await this.store.setEnded(coder.coderId, coder.ended);
    return { reopen: this.reopen(coder) };
  }

  /**
   * Whether an ended session can be opened again: after completing it,
   * within `REOPEN_MS` (always, if the job keeps sessions open). Not after a
   * screenout (the answers that screened the coder out stay), quitting, or
   * asking for deletion.
   */
  private reopen(coder: Coder): Reopen {
    const { ended } = coder;
    if (!ended || ended.outcome !== "complete" || coder.deletionRequest) return null;
    if (this.spec.keepSessionsOpen) return { until: null };
    const until = new Date(new Date(ended.at).getTime() + REOPEN_MS);
    return until.getTime() > this.options.now() ? { until } : null;
  }

  /** Goes back after completing the session (`reopen`): it is open again. */
  async reopenSession(coder: Coder): Promise<void> {
    if (!coder.ended) return;
    if (!this.reopen(coder)) throw new HttpError(409, "This session has ended", "session_closed");
    coder.ended = null;
    await this.store.setEnded(coder.coderId, null);
  }

  /** An ended session is closed, unless the job keeps sessions open: the coder gets only what the end screen shows. */
  private closed(coder: Coder): boolean {
    return coder.ended !== null && !this.spec.keepSessionsOpen;
  }

  /** The values an ended session's end screen uses (contracts EndValues): its message's and redirect link's references. */
  private async endValues(coder: Coder, values: Record<string, CoderValue>): Promise<EndValues | null> {
    const { ended } = coder;
    if (!ended) return null;
    const end = ended.item ? findEndItem(this.spec.codebook.items, ended.item) : null;
    const source = `${end?.message ?? ""}\n${end?.redirectUrl ?? ""}`;
    // Every `$var.x` / `$unit.x` written anywhere in them (texts, scripts, block conditions).
    const names = (ns: string) => new Set([...source.matchAll(new RegExp(`\\$${ns}\\.([A-Za-z0-9_]+)`, "g"))].map((m) => m[1]));
    const pick = <T>(values: Record<string, T>, wanted: Set<string>) => Object.fromEntries(Object.entries(values).filter(([k]) => wanted.has(k)));
    const vars = names("var");
    let unit: EndValues["unit"] = null;
    if (ended.unit) {
      const [data, answers] = await Promise.all([
        this.getUnits([ended.unit.id]).then((units) => units.get(ended.unit!.id)?.data ?? {}),
        this.store.unitAnswers(coder.coderId, ended.unit.id),
      ]);
      unit = { data: pick(data, names("unit")), variables: pick(answers, vars) };
    }
    return { variables: pick(plainValues(values), vars), unit };
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
      await this.store.setEnded(coder.coderId, coder.ended);
    }
    if (requestDeletion) {
      coder.deletionRequest = { at };
      await this.store.requestDeletion(coder.coderId, coder.deletionRequest);
    }
  }

  private assertOpen(coder: Coder): void {
    if (coder.ended) throw new HttpError(409, "This session has ended", "session_ended");
  }

  /**
   * Coder-level answers: a row each (only those that changed), like unit
   * answers. Values for `auto` questions, and for frozen answers, are
   * ignored: those don't change.
   */
  async submitCoderVariables(
    coder: Coder,
    variables: Record<string, VariableValue>,
    deviceId: number | null = null,
    timings: Record<string, AnswerTiming> = {},
  ): Promise<void> {
    this.assertOpen(coder);
    const errors = validateVariables(this.coderVariableTypes, variables);
    if (errors.length > 0) throw new HttpError(400, errors.join("; "));
    const auto = new Set(this.autoVariables.map(([name]) => name));
    const stored = await this.store.coderValues(coder.coderId);
    const open = (name: string) => !auto.has(name) && !stored[name]?.assigned && !stored[name]?.frozen;
    const changed = Object.fromEntries(
      Object.entries(variables).filter(([name, value]) => open(name) && JSON.stringify(stored[name]?.value) !== JSON.stringify(value)),
    );
    // Timings of answered questions only (an unchanged answer: its timing alone is updated)
    const timed = Object.fromEntries(Object.entries(timings).filter(([name]) => open(name) && (name in changed || name in stored)));
    if (Object.keys(changed).length === 0 && Object.keys(timed).length === 0) return;
    await this.store.checkAnswers(changed);
    await this.store.putCoderValues({ coderId: coder.coderId, values: changed, codebookId: this.spec.codebook.id, deviceId, timings: timed });
  }

  // --- routing ----------------------------------------------------------------

  /** A unitset's units, as of the spec. */
  private unitsOf(unitset: string): number[] {
    return this.unitsets.get(unitset) ?? [];
  }

  /** All units of a route (own set and overlap). */
  private routeUnits(route: Route | null): Set<number> {
    return new Set(route ? route.names.flatMap((name) => this.unitsOf(name)) : []);
  }

  /** How many units the coder will get in a loop, if that doesn't depend on other coders. */
  private expectedUnits(route: Route | null): number | null {
    if (!route) return null;
    const { branch, names } = route;
    const size = this.unitsOf(names[0]).length;
    const own = branch.mode === "shared" ? (branch.maxUnits === undefined ? null : Math.min(branch.maxUnits, size)) : size;
    return own === null ? null : own + (branch.overlap ? this.unitsOf(names[1]).length : 0);
  }

  /** A route's pools, working on these codings and (shared queues) leases. */
  private pools(route: Route, codings: Codings, leases: Lease[]): Routed {
    const { branch, names } = route;
    const main = new UnitPool(names[0], this.unitsOf(names[0]), branch.mode === "shared" ? sharedDefaults(branch) : null, codings);
    main.loadLeases(leases.filter((l) => l.unitset === names[0]).map((l) => ({ ...l, expires: new Date(l.expires).getTime() })));
    const overlap = branch.overlap
      ? { pool: new UnitPool(names[1], this.unitsOf(names[1]), null, codings), placement: branch.overlap.placement ?? ("before" as const) }
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
  private assignedRoute(coder: Coder, loop: string): Route | null {
    const info = this.loops.get(loop);
    if (!info) return null;
    for (const branch of info.loop.units) {
      const assignment = coder.assignments[branchFingerprint(branch)];
      if (assignment && DeploymentRuntime.fits(branch, assignment.unitsets)) return { branch, names: assignment.unitsets };
    }
    return null;
  }

  /**
   * Routes a coder in a loop. The client evaluates the branch conditions
   * (they may use answers the server shouldn't need, docs/encryption.md)
   * and sends the chosen branch with its filled-in unitset names; the server
   * checks that the names fit that branch and exist. It picks the coder's
   * set itself in `sets` mode (the one with the fewest coders, under a
   * lock) and `invitation` mode (their invite's). A loop with a single
   * unconditional branch without references routes without a choice.
   * Sticky: stored with the coder, and reused as long as the codebook still
   * has a branch that produces the same unitsets (so a codebook update that
   * keeps it doesn't move coders around). Null if the coder gets no units
   * here (an invitation without units; tried again next time).
   */
  private async route(coder: Coder, info: LoopInfo, choice: BranchChoice): Promise<Route | null> {
    const loop = info.loop;
    const title = loopTitle(loop, info.key);
    const existing = this.assignedRoute(coder, info.key);
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
    if (branch.mode === "invitation") {
      const own = await this.store.inviteUnitset(coder.inviteId ?? "first");
      if (own === null) return null;
      names[0] = own;
    }
    const check = () => {
      const missing = names.find((name) => !this.unitsets.has(name));
      if (missing !== undefined) throw new HttpError(409, `${title}: unitset '${missing}' does not exist for this coder`);
    };
    const save = async (store: Store) => {
      const assignment = { unitsets: names, at: this.options.now() };
      await store.routeCoder(coder.coderId, branchFingerprint(branch), assignment);
      coder.assignments = { ...coder.assignments, [branchFingerprint(branch)]: assignment };
    };
    if (branch.mode === "sets") {
      // The set with the fewest coders, counted under a lock: coders starting at the same moment spread over the sets.
      await this.store.locked(`sets/${info.key}`, async (store) => {
        names[0] = await this.leastCodedSet(store, info, branch.unitsets);
        check();
        await save(store);
      });
    } else {
      check();
      await save(this.store);
    }
    return { branch, names };
  }

  /**
   * The set with the fewest coders (the first of those), counting a coder
   * for their set if they finished it, or were routed or finished a unit in
   * the last 24 hours (contracts SET_ACTIVITY_MS): sets of coders who
   * dropped out are handed out again.
   */
  private async leastCodedSet(store: Store, info: LoopInfo, sets: string[]): Promise<string> {
    const [coders, rows] = await Promise.all([store.listCoders(), store.listCodings({ loop: info.key })]);
    const codings = DeploymentRuntime.codingsOf(rows);
    const now = this.options.now();
    const counts = new Map(sets.map((s) => [s, 0]));
    for (const coder of coders) {
      const route = this.assignedRoute(coder, info.key);
      if (route?.branch.mode !== "sets") continue;
      const set = route.names[0];
      if (!counts.has(set)) continue;
      const at = coder.assignments[branchFingerprint(route.branch)].at;
      const active = now - Math.max(at, codings.lastFinished(coder.coderId)) < SET_ACTIVITY_MS;
      const finished = this.unitsOf(set).every((id) => codings.has(coder.coderId, id));
      if (active || finished) counts.set(set, counts.get(set)! + 1);
    }
    return sets.reduce((best, s) => (counts.get(s)! < counts.get(best)! ? s : best));
  }

  // --- units ------------------------------------------------------------------

  /**
   * The coder's next unit in a loop, or null when they are done with it. In
   * a shared queue it is picked under the queue's lock, counting every
   * coder's codings and leases, and leased to the coder.
   */
  async nextUnit(coder: Coder, loopName: string, choice: BranchChoice = { unitsets: [] }): Promise<CoderUnitResponse | null> {
    this.assertOpen(coder);
    if (!this.spec.active) throw new HttpError(409, "This job is not active");
    const info = this.loops.get(loopName);
    if (!info) throw new HttpError(404, `No unit loop '${loopName}'`);
    const route = await this.route(coder, info, choice);
    if (!route) return null;
    const unit =
      route.branch.mode === "shared"
        ? await this.store.locked(`queue/${info.key}/${route.names[0]}`, (store) => this.pick(store, coder, info, route))
        : await this.pick(this.store, coder, info, route);
    if (!unit) return null;
    const [shown, answers] = await Promise.all([this.markServed(coder.coderId, unit), this.store.unitAnswers(coder.coderId, unit.id)]);
    return { id: unit.id, externalId: unit.externalId, data: shown.data, variables: answers };
  }

  /** Picks the coder's next unit (and leases it, in a shared queue); skips units that no longer exist. */
  private async pick(store: Store, coder: Coder, info: LoopInfo, route: Route): Promise<Unit | null> {
    const shared = route.branch.mode === "shared";
    // A shared queue counts every coder; otherwise only the coder's own codings matter.
    const [rows, leases] = await Promise.all([
      store.listCodings(shared ? { loop: info.key } : { loop: info.key, coderId: coder.coderId }),
      shared ? store.listLeases({ loop: info.key }) : Promise.resolve([]),
    ]);
    const codings = DeploymentRuntime.codingsOf(rows);
    const { main, overlap } = this.pools(route, codings, leases);
    for (;;) {
      const now = this.options.now();
      const next = pickNext(main, overlap, coder.coderId, codings, {
        order: info.loop.order ?? "sequential",
        maxUnits: route.branch.mode === "shared" ? route.branch.maxUnits : undefined,
        minUnits: route.branch.mode === "shared" ? route.branch.minUnits : undefined,
        seed: this.spec.jobId * 1000,
        now,
      });
      if (!next) return null;
      const unit = (await this.getUnits([next.unitId], store)).get(next.unitId);
      if (!unit) {
        // Deleted since the spec was read: skip it.
        main.removeUnit(next.unitId);
        overlap?.pool.removeUnit(next.unitId);
        continue;
      }
      if (next.pool.rule) {
        next.pool.take(coder.coderId, next.unitId, now);
        const expires = new Date(now + next.pool.rule.leaseSeconds * 1000);
        await store.putLease({ loop: info.key, unitset: next.pool.unitset, coderId: coder.coderId, unitId: next.unitId, expires });
      }
      return unit;
    }
  }

  /**
   * A unit the coder already worked on in a loop (has answers for, or holds
   * a lease on), so a resumed session can navigate back to it.
   */
  async loopUnit(coder: Coder, loopName: string, unitId: number): Promise<CoderUnitResponse> {
    if (this.closed(coder)) throw new HttpError(409, "This session has ended", "session_closed");
    if (!this.loops.has(loopName)) throw new HttpError(404, `No unit loop '${loopName}'`);
    const route = this.assignedRoute(coder, loopName);
    const [answers, leases] = await Promise.all([this.store.unitAnswers(coder.coderId, unitId), this.store.listLeases({ coderId: coder.coderId })]);
    const answered = Object.keys(answers).length > 0;
    const held = leases.some((l) => l.loop === loopName && l.unitId === unitId);
    // Only units the coder has worked on (or holds): no peeking ahead.
    if (!this.routeUnits(route).has(unitId) || !(answered || held)) throw new HttpError(404, "This unit is not part of your session");
    const unit = (await this.getUnits([unitId])).get(unitId);
    if (!unit) throw new HttpError(404, "Unit not found");
    const shown = await this.markServed(coder.coderId, unit);
    return { id: unit.id, externalId: unit.externalId, data: shown.data, variables: answers };
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
    deviceId: number | null = null,
    timings: Record<string, AnswerTiming> = {},
  ): Promise<void> {
    this.assertOpen(coder);
    const [own, leases] = await Promise.all([this.store.listCodings({ coderId: coder.coderId }), this.store.listLeases({ coderId: coder.coderId })]);
    // Units in the coder's route; in a shared queue only their own earlier
    // codings (editing after going back) or the unit leased to them (an
    // expired lease still counts: at worst one coding too many).
    const canSubmit = (info: LoopInfo) => {
      const route = this.assignedRoute(coder, info.key);
      if (!route) return false;
      const [main, overlap] = route.names;
      if (route.branch.overlap && this.unitsOf(overlap).includes(unitId)) return true;
      if (!this.unitsOf(main).includes(unitId)) return false;
      if (route.branch.mode !== "shared") return true;
      return own.some((c) => c.loop === info.key && c.unitId === unitId) || leases.some((l) => l.loop === info.key && l.unitset === main && l.unitId === unitId);
    };
    const loops = [...this.loops.values()].filter((info) => (loopName === undefined || info.key === loopName) && canSubmit(info));
    if (loops.length === 0) throw new HttpError(409, "Unit is not assigned to this coder");

    const info = loops.find((l) => [...l.variables.keys()].every((name) => name in variables));
    if (!info) {
      const missing = [...loops[0].variables.keys()].filter((name) => !(name in variables));
      throw new HttpError(400, `Unit not finished: no answer for ${missing.join(", ")}`);
    }
    const errors = validateVariables(info.variables, variables);
    if (errors.length > 0) throw new HttpError(400, errors.join("; "));
    await this.store.checkAnswers(variables);

    // Values of other variables (e.g. questions an update removed) are left
    // alone, so they stay as data. With them: the unit version the coder
    // saw (which may be older than the unit's content now).
    let unitVersionId = (await this.store.servedVersion(coder.coderId, unitId)) ?? undefined;
    if (unitVersionId === undefined) {
      const unit = (await this.getUnits([unitId])).get(unitId);
      unitVersionId = unit && (await this.shownVersion(unit)).versionId;
    }
    // The loops these answers (with the unit's earlier ones) finish the unit in.
    const merged = { ...(await this.store.unitAnswers(coder.coderId, unitId)), ...variables };
    const codings = finishedLoops(merged, this.loops.values()).map((l) => ({ loop: l.key, agreement: agreementKeys(merged, l) }));
    await this.store.putAnnotation({
      unitId,
      coderId: coder.coderId,
      variables,
      codebookId: this.spec.codebook.id,
      unitVersionId,
      deviceId,
      timings: Object.fromEntries(Object.entries(timings).filter(([name]) => name in variables)),
      codings,
    });
    // The coder-level answers this loop depends on can't change any more.
    await this.store.freezeCoderValues(coder.coderId, this.dependencies.get(info.key) ?? []);
  }

  get version(): number {
    return this.spec.version;
  }

  /** Progress per loop and unitset: from every coder's codings, routing and leases. */
  async status(): Promise<DeploymentStatus> {
    const now = this.options.now();
    const [rows, allCoders, leases] = await Promise.all([this.store.listCodings({}), this.store.listCoders(), this.store.listLeases({})]);
    const sources: DeploymentStatus["sources"] = [];
    for (const [loop, info] of this.loops) {
      const codings = DeploymentRuntime.codingsOf(rows.filter((r) => r.loop === loop));
      const routes = allCoders.flatMap((c) => {
        const route = this.assignedRoute(c, loop);
        return route ? [{ coderId: c.coderId, route }] : [];
      });
      // One row per pool: a unitset with its rule (a shared queue, or handed out whole).
      const pools = new Map<string, { pool: UnitPool; coders: number[] }>();
      for (const { coderId, route } of routes) {
        const routed = this.pools(route, codings, leases.filter((l) => l.loop === loop));
        for (const pool of [routed.main, ...(routed.overlap ? [routed.overlap.pool] : [])]) {
          const key = `${pool.unitset}/${JSON.stringify(pool.rule)}`;
          if (!pools.has(key)) pools.set(key, { pool, coders: [] });
          pools.get(key)!.coders.push(coderId);
        }
      }
      for (const { pool, coders } of pools.values()) {
        sources.push({ loop: loopTitle(info.loop, loop), unitset: pool.unitset, ...pool.status(now, coders), coders: coders.length });
      }
    }
    return {
      deploymentId: this.id,
      version: this.spec.version,
      active: this.spec.active,
      coders: allCoders.length,
      sources,
      loadedAt: new Date(this.loadedAt),
    };
  }

  /**
   * A unit as coders see it under this codebook (docs/architecture.md
   * §8.4): only the fields it uses (`shownUnitFields`), and the id of that
   * unit version, stored the first time it is shown.
   */
  private async shownVersion(unit: Unit): Promise<{ data: UnitData; versionId: number }> {
    const data: UnitData = Object.fromEntries(this.shownFields.filter((f) => f in unit.data).map((f) => [f, unit.data[f]]));
    return { data, versionId: await this.store.unitVersion(unit.id, unitHash(unit.externalId, data), data) };
  }

  /** Records which version of a unit the coder was shown; returns it. */
  private async markServed(coderId: number, unit: Unit): Promise<{ data: UnitData; versionId: number }> {
    const shown = await this.shownVersion(unit);
    await this.store.recordServe(coderId, unit.id, shown.versionId);
    return shown;
  }

  private async getUnits(ids: number[], store: Store = this.store): Promise<Map<number, Unit>> {
    return new Map((await store.getUnits(ids)).map((unit) => [unit.id, unit]));
  }
}

/** Hex SHA-256 of a text (Web Crypto: the runtime runs outside Node too). */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function agreementKeys(variables: Record<string, VariableValue>, info: LoopInfo): AgreementKeys {
  return Object.fromEntries(loopAgreementVariables(info).map((v) => [v, agreementKey(variables, v)]));
}
