import {
  type AnswerTiming,
  shownUnitFields,
  type UnitData,
  type AnyVariableType,
  ALL_UNITS_SET,
  CODER_SET,
  CONDITION_SET,
  PART_SET,
  TEST_SET,
  loopShareColumns,
  type ShareColumn,
  loopDependencies,
  loopTitle,
  sessionItem,
  setKey,
  sharedDefaults,
  collectQuestions,
  answerColumn,
  feedbackColumn,
  parseAnswerKey,
  answerMatchesKey,
  type SubmitUnitResponse,
  type TestSetType,
  toCoderItems,
  DEFAULT_RATE,
  resolveRedirects,
  type CoderCodebook,
  type CoderUnitResponse,
  type DeploymentStatus,
  type EndUnit,
  type EndValues,
  type Reopen,
  type SessionResponse,
  type ResolvedLoopUnits,
  type TransferResponse,
  type TopLevelItem,
  type VariableValue,
  type PickNamesResponse,
  type DisplayEntry,
  validateVariables,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { Codings, UnitPool, pickNext, type AgreementKeys, type OverlapPlacement } from "./distribution.js";
import type { Store } from "./store.js";
import type { DeviceDetails } from "../shared/devices.js";
import type {
  Coder,
  CoderValue,
  Coding,
  DeploymentSpec,
  Lease,
  ResolveCoderRequest,
  ResolvedCoder,
  Unit,
} from "./types.js";
import { runtimeInvite, type SessionRules } from "./sessionValues.js";
import {
  agreementKey,
  singleValue,
  codingsSignature,
  collectCoderVariables,
  collectLoops,
  findEndItem,
  finishedLoops,
  loopAgreementVariables,
  valueOf,
  type LoopInfo,
} from "./designItems.js";
import { leastUsed } from "./draws.js";

/** Stored coder-level answers as plain values. */
const plainValues = (values: Record<string, CoderValue>) =>
  Object.fromEntries(Object.entries(values).map(([name, v]) => [name, v.value]));

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

/**
 * A coder's units in a loop (docs/architecture.md §6,
 * docs/plans/unit-sets.md): those whose cells hold the session's values in
 * every set column a value is linked to (the coder's `coder_set`, the
 * condition's `condition_set`), within the loop's part (`part_set`); or for
 * a loop taking an earlier loop's units, the units the coder finished
 * there. Shared by every coder with the same values: `key` names it (the
 * pool of a shared queue, its leases, a row of the status). The test units
 * (`test_set`) come apart, for everyone: overlap, practice and gold (those
 * with a part only in that part's loops).
 */
interface Share {
  key: string;
  own: number[];
  overlap: number[];
  practice: number[];
  gold: number[];
  /** An earlier loop's units, before the coder reached this loop: not known yet. */
  pending?: boolean;
}

/** A coder's units in a loop: the loop's settings, and their share. */
interface Route {
  units: ResolvedLoopUnits;
  share: Share;
}

const PLACEMENTS = { first: "before", last: "after", spread: "spread", rate: "rate" } as const;

/** A route's pools, with the state they were loaded with. */
interface Routed {
  units: ResolvedLoopUnits;
  main: UnitPool;
  /** The test units' pools besides the coder's own units: practice, overlap, gold (in that order of precedence). */
  extras: OverlapPlacement[];
}

/** The test units a loop can mix in, in order of precedence when several are due. */
const SPECIAL = [
  { set: "practice", units: (s: Share) => s.practice, settings: (u: ResolvedLoopUnits) => u.practice },
  {
    set: "overlap",
    units: (s: Share) => s.overlap,
    settings: (u: ResolvedLoopUnits) => (u.overlap?.placement === "disabled" ? undefined : u.overlap),
  },
  { set: "gold", units: (s: Share) => s.gold, settings: (u: ResolvedLoopUnits) => u.gold },
] as const;

type RandomVariable = Extract<AnyVariableType, { type: "random" }>;

/** One coder's request for units from a loop (`DeploymentRuntime.pick`). */
interface PickRequest {
  coder: Coder;
  info: LoopInfo;
  route: Route;
  count: number;
}

interface PickWaiter {
  request: PickRequest;
  resolve: (units: Unit[]) => void;
  reject: (error: unknown) => void;
}

/** At most this many requests picked in one turn of a shared queue's lock (a turn is one transaction). */
const MAX_PICKS_PER_TURN = 50;

/**
 * The waiting requests for the next turn, in order, taken off `queue`. A
 * coder's second request waits for a later turn: asked again, a coder gets
 * the units they hold, which a turn knows only once it's over.
 */
function takeTurn(queue: PickWaiter[]): PickWaiter[] {
  const turn: PickWaiter[] = [];
  const coders = new Set<number>();
  for (let i = 0; i < queue.length && turn.length < MAX_PICKS_PER_TURN;) {
    const sessionId = queue[i]!.request.coder.sessionId;
    if (coders.has(sessionId)) {
      i++;
      continue;
    }
    coders.add(sessionId);
    turn.push(...queue.splice(i, 1));
  }
  return turn;
}

/**
 * The coder runtime of one deployed study (docs/architecture.md §3).
 * Everything it works with is in the database and read per request: the
 * coder, their answers, units, finished codings (`unit_codings`) and the
 * leases of shared queues (`unit_leases`). Decisions that count other
 * coders (a shared queue's next unit, a balanced draw) run under a
 * database lock (`Store.locked`), so any number of server processes can
 * serve the same study. In memory only the deployment spec, re-read when its
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
  private coderVariableTypes = new Map<string, AnyVariableType>();
  /** Loop key -> the coder-level questions it depends on (`loopDependencies`), frozen once a coder coded a unit there. */
  private dependencies = new Map<string, string[]>();
  private randomVariables: [string, RandomVariable][] = [];
  /** Set key (`column/set`, and `__all__`) -> its units in order. */
  private sets = new Map<string, number[]>();
  /** Column with a role -> its values (sets). */
  private groups = new Map<string, string[]>();
  /** Loop key -> the session values that select its units (contracts `loopShareColumns`). */
  private shareColumns = new Map<string, ShareColumn[]>();
  /** Shares computed from the current sets, by key. */
  private shares = new Map<string, Share>();
  /** The codebook's questions, by name (practice feedback, texts). */
  private questions = new Map<string, AnyVariableType>();
  /** The unit fields the codebook shows (`shownUnitFields`): all coders get. */
  private shownFields: string[] = [];
  /** What coders get of the codebook (contracts `toCoderItems`). */
  private coderCodebook!: CoderCodebook;
  /** The deployment's stamp when the spec was read (`Store.deploymentStamp`). */
  private stamp: string | null = null;
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
          this.spec = {
            ...this.spec,
            active: spec.active,
            reopenMinutes: spec.reopenMinutes,
            newUnitsMessage: spec.newUnitsMessage,
            sets: spec.sets,
            redirectUrls: spec.redirectUrls,
          };
          this.applySets(spec);
          // Panel return links are deployment settings: they change without a new version
          this.coderCodebook = {
            ...this.coderCodebook,
            items: resolveRedirects(toCoderItems(this.spec.design.items as TopLevelItem[]), spec.redirectUrls),
          };
        }
        // Only once read: a failed read (e.g. a suspended study) is tried again next time.
        this.stamp = stamp;
      } finally {
        this.refreshing = null;
      }
    })();
    await this.refreshing;
  }

  private applySpec(spec: DeploymentSpec): void {
    this.spec = spec;
    const items = spec.design.items as TopLevelItem[];
    this.loops = new Map(collectLoops(items).map((l) => [l.key, l]));
    this.coderVariableTypes = collectCoderVariables(items);
    this.dependencies = new Map(
      [...loopDependencies(items)].map(([key, names]) => [
        key,
        names.filter((name) => this.coderVariableTypes.has(name)),
      ]),
    );
    this.randomVariables = [...this.coderVariableTypes].filter(
      (e): e is [string, RandomVariable] => e[1].type === "random",
    );
    this.shareColumns = loopShareColumns(items);
    this.applySets(spec);
    this.shownFields = shownUnitFields(items);
    this.questions = collectQuestions(items).questions;
    this.coderCodebook = {
      id: spec.design.id,
      title: spec.design.public?.title ?? null,
      ...(sessionItem(items)?.display ? { display: sessionItem(items)!.display } : {}),
      items: resolveRedirects(toCoderItems(items), spec.redirectUrls),
    };
  }

  private applySets(spec: DeploymentSpec): void {
    this.sets = new Map(spec.sets.map((u) => [u.name, u.unitIds]));
    this.groups = new Map();
    this.shares = new Map();
    for (const { name } of spec.sets) {
      const at = name.indexOf("/");
      if (at < 0) continue;
      const [group, set] = [name.slice(0, at), name.slice(at + 1)];
      if (!this.groups.has(group)) this.groups.set(group, []);
      this.groups.get(group)!.push(set);
    }
  }

  /** What the codebook asks of a new session (its Study entry), and the coders. */
  private get sessionRules(): SessionRules {
    const items = this.spec.design.items as TopLevelItem[];
    return { item: sessionItem(items), coders: this.groups.get(CODER_SET) ?? [] };
  }

  /**
   * A pick-your-name link's names: the coders (`coder_set`), and which
   * are taken (where a name is the first device's that picks it).
   */
  async pickNames(): Promise<PickNamesResponse> {
    const invite = runtimeInvite(this.sessionRules.item);
    if (invite.mode !== "coders" || invite.link !== "pick_name")
      throw new HttpError(404, "This link has no names to pick", "link_not_found");
    const taken = new Set<string>();
    if ((invite.nameDevices ?? "first") === "first")
      for (const coder of await this.store.listCoders()) if (coder.session.coder) taken.add(coder.session.coder);
    const names = this.groups.get(CODER_SET) ?? [];
    return { names: names.map((name) => ({ name, taken: taken.has(name) })) };
  }

  /** The URL parameter with a crowd's coder id, if any: part of a device's session key. */
  get coderParam(): string | null {
    const invite = runtimeInvite(sessionItem(this.spec.design.items as TopLevelItem[]));
    return invite.mode === "crowd" ? (invite.coderParam?.param ?? null) : null;
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
        loops: [...this.loops.values()].map((info) => ({
          loop: info.key,
          variables: [...info.variables.keys()],
          values: loopAgreementVariables(info),
        })),
      });
      const codings = rows.flatMap((row): Coding[] => {
        const info = this.loops.get(row.loop);
        if (!info || row.unitId === null) return [];
        return [
          {
            loop: row.loop,
            unitId: row.unitId,
            sessionId: row.sessionId,
            agreement: agreementKeys(row.values ?? {}, info),
            created: row.created,
            updated: row.created,
          },
        ];
      });
      await store.replaceCodings(basis, codings);
    });
  }

  /** Finished codings as distribution reads them. */
  private static codingsOf(rows: Coding[]): Codings {
    const codings = new Codings();
    for (const row of rows) codings.record(row.sessionId, row.unitId, row.agreement, new Date(row.updated).getTime());
    return codings;
  }

  // --- coders -----------------------------------------------------------------

  /**
   * The coder for a coder key, created on first use (from the link, with
   * coder id / new-session confirmation, see docs/coder-identity.md).
   * Read from the database on every request: one indexed query.
   */
  resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    return this.store.resolveCoder({
      ...request,
      paused: !this.spec.active,
      sessionRules: this.sessionRules,
    });
  }

  /**
   * The coder reached an experiment (a random variable): its value, assigned now if the
   * coder has none yet (random; balanced: the option the fewest coders
   * who reached it have, under a lock; with `stratify`, only among coders
   * with the same answers to those questions, or session values; or the
   * session's URL parameter `param`, which must be a condition). Once
   * assigned it never changes. Coders who never reach it (screened out
   * before) don't count. An experiment that selects units (`units`) draws
   * from `condition_set`'s values unless it lists options, and its value is
   * added to the session's values: it selects the units of the loops after it.
   */
  async assignCondition(coder: Coder, name: string): Promise<VariableValue> {
    this.assertOpen(coder);
    const variable = this.randomVariables.find(([n]) => n === name)?.[1];
    if (!variable) throw new HttpError(404, `No experiment '${name}'`);
    const options =
      variable.options ?? (variable.units ? (this.groups.get(CONDITION_SET) ?? []).map((value) => ({ value })) : []);
    if (options.length === 0) throw new HttpError(409, `Experiment '${name}' has no values yet`);
    // Linked to units: the value goes into the session values, once (a session value never changes, so
    // the coder's units don't either); the session's value is the variable's
    const linked = async (value: VariableValue): Promise<VariableValue> => {
      const plain = valueOf(value);
      if (!variable.units || plain === undefined) return value;
      const kept = await this.store.setSessionValue(coder.sessionId, name, String(plain));
      coder.session = { ...coder.session, [name]: kept };
      return kept === String(plain) ? value : singleValue(kept);
    };
    const stored = (await this.store.coderValues(coder.sessionId))[name];
    if (stored) return linked(stored.value);
    // Already in the session (e.g. its answers were reset): the same value again, not a new draw
    const kept = variable.units ? coder.session[name] : undefined;
    // From a URL parameter: nothing is drawn, but the value must be a condition
    const given = variable.draw === "url_param" ? coder.session[variable.param ?? ""] : undefined;
    if (variable.draw === "url_param" && kept === undefined && !options.some((o) => o.value === given))
      throw new HttpError(409, `Experiment '${name}': the link's ${variable.param} is not one of its conditions`);
    const put = (store: Store, value: VariableValue) =>
      store.putCoderValues({
        sessionId: coder.sessionId,
        values: { [name]: value },
        assigned: true,
        designVersionId: this.spec.design.id,
      });
    if (variable.draw !== "balanced" || kept !== undefined) {
      // Under the coder's own lock: two requests of this coder at once draw once (the first write wins)
      const value = await this.store.locked(`condition/${name}/${coder.sessionId}`, async (store) => {
        const again = (await store.coderValues(coder.sessionId))[name];
        if (again) return again.value;
        const value = singleValue(kept ?? given ?? this.drawWeighted(options));
        await put(store, value);
        return value;
      });
      return linked(value);
    }
    const value = await this.store.locked(`balanced/${name}`, async (store) => {
      // Another request of this coder may have assigned it meanwhile
      const own = await store.coderValues(coder.sessionId);
      if (own[name]) return own[name].value;
      const drawn = await this.drawBalanced(store, coder, plainValues(own), name, variable.stratify ?? [], options);
      const value = singleValue(drawn);
      await put(store, value);
      return value;
    });
    return linked(value);
  }

  /**
   * A balanced draw (under the item's lock): the option the fewest coders
   * who reached the item have; with `stratify`, counting only coders with
   * the same answers to those questions (or `session.<name>` values).
   */
  private async drawBalanced(
    store: Store,
    coder: Coder,
    ownValues: Record<string, VariableValue>,
    name: string,
    stratify: string[],
    options: { value: string }[],
  ): Promise<string> {
    const stratum = (values: Record<string, VariableValue | undefined>, session: Record<string, string>) =>
      JSON.stringify(
        stratify.map((s) =>
          s.startsWith("session.") ? (session[s.slice("session.".length)] ?? null) : (valueOf(values[s]) ?? null),
        ),
      );
    const mine = stratum(ownValues, coder.session);
    const others = (await store.coderValuesOf([name, ...stratify.filter((s) => !s.startsWith("session."))]))
      .filter((c) => stratum(c.values, c.session) === mine)
      .map((c) => c.values[name]);
    const counts = new Map<string, number>();
    for (const taken of others) {
      const v = valueOf(taken);
      if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return leastUsed(
      options.map((o) => o.value),
      (v) => counts.get(v) ?? 0,
      this.options.random,
    );
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

  /** A one-time token that lets another device continue this coder's session (docs/coder-identity.md §4). */
  async createTransfer(coder: Coder): Promise<TransferResponse> {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const expires = new Date(this.options.now() + this.options.transferTtlMs);
    await this.store.createTransfer(await sha256(token), {
      sessionId: coder.sessionId,
      coder: coder.session.coder ?? null,
      expires,
    });
    return { token, expiresAt: expires };
  }

  /**
   * Redeems a transfer token (once): the new device joins the session, with
   * its keys for it (`keys`, from the session's coder id: coder.ts).
   */
  async redeemTransfer(
    token: string,
    keys: (coderId: string | null) => Promise<string[]>,
    device: DeviceDetails,
  ): Promise<void> {
    const transfer = await this.store.redeemTransfer(await sha256(token), new Date(this.options.now()));
    if (!transfer) throw new HttpError(404, "This link has expired or was already used", "transfer_invalid");
    for (const key of await keys(transfer.coder)) await this.store.addDevice(transfer.sessionId, key, device);
  }

  /** The session for the client. */
  async session(coder: Coder): Promise<SessionResponse> {
    const newUnits = await this.noticeNewUnits(coder);
    const values = await this.store.coderValues(coder.sessionId);
    const [endValues, codings] = await Promise.all([
      this.endValues(coder, values),
      this.store.listCodings({ sessionId: coder.sessionId }),
    ]);
    const live = new Set(this.sets.get(ALL_UNITS_SET) ?? []);
    return {
      sessionId: coder.sessionId,
      studyId: this.spec.studyId,
      // Only what coding needs (contracts toCoderItems): not how units are handed out
      codebook: this.coderCodebook,
      version: this.spec.version,
      progress: [...this.loops.values()].map((info) => {
        const route = this.routeOf(coder, info);
        const units = this.routeUnits(route);
        // Units the coder coded here stay theirs, also once moved to another coder (not once deleted)
        const done = codings.filter((c) => c.loop === info.key && (units.has(c.unitId) || live.has(c.unitId)));
        const expected = this.expectedUnits(route);
        const elsewhere = done.filter((c) => !units.has(c.unitId)).length;
        return {
          set: info.key,
          doneUnitIds: done.map((c) => c.unitId),
          totalUnits: expected === null ? null : expected + elsewhere,
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
      newUnits,
    };
  }

  /**
   * Units the coder got since they last loaded the session (the researcher
   * added units or moved units to them): counted in the loops they reached,
   * where their number doesn't depend on other coders. A finished session
   * that can still be reopened is opened again, so they code them. Told
   * once, with the deployment's message.
   */
  private async noticeNewUnits(coder: Coder): Promise<SessionResponse["newUnits"]> {
    let total = 0;
    for (const info of this.loops.values()) {
      if (coder.assignments[info.key]) total += this.expectedUnits(this.routeOf(coder, info)) ?? 0;
    }
    if (total === coder.knownUnits) return null;
    const count = coder.knownUnits === null ? 0 : total - coder.knownUnits;
    coder.knownUnits = total;
    await this.store.setKnownUnits(coder.sessionId, total);
    if (count <= 0) return null;
    if (coder.ended) {
      // Too late to go back: nothing to tell
      if (!this.reopen(coder)) return null;
      coder.ended = null;
      await this.store.setEnded(coder.sessionId, null);
    }
    const message = this.spec.newUnitsMessage;
    return message ? { count, message: message.replaceAll("{n}", String(count)) } : null;
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
    // Without an item: the coder went through the whole study.
    const end = item === undefined ? null : findEndItem(this.spec.design.items, item);
    if (item !== undefined && !end) throw new HttpError(400, `No end item '${item}'`);
    if (
      unit &&
      (!this.loops.has(unit.loop) || Object.keys(await this.store.unitAnswers(coder.sessionId, unit.id)).length === 0)
    ) {
      throw new HttpError(400, "The end's unit is not one you answered");
    }
    coder.ended = {
      ...(item ? { item } : {}),
      ...(unit ? { unit } : {}),
      outcome: end?.outcome ?? "complete",
      at: new Date(this.options.now()),
    };
    await this.store.setEnded(coder.sessionId, coder.ended);
    return { reopen: this.reopen(coder) };
  }

  /**
   * Whether an ended session can be opened again: after completing it,
   * within the study's reopen time (`reopenMinutes`; null: always). Not after a
   * screenout (the answers that screened the coder out stay), quitting, or
   * asking for deletion.
   */
  private reopen(coder: Coder): Reopen {
    const { ended } = coder;
    if (!ended || ended.outcome !== "complete" || coder.deletionRequest) return null;
    if (this.spec.reopenMinutes === null) return { until: null };
    const until = new Date(new Date(ended.at).getTime() + this.spec.reopenMinutes * 60_000);
    return until.getTime() > this.options.now() ? { until } : null;
  }

  /** Goes back after completing the session (`reopen`): it is open again. */
  async reopenSession(coder: Coder): Promise<void> {
    if (!coder.ended) return;
    if (!this.reopen(coder)) throw new HttpError(409, "This session has ended", "session_closed");
    coder.ended = null;
    await this.store.setEnded(coder.sessionId, null);
  }

  /** An ended session is closed, unless the study keeps sessions open: the coder gets only what the end screen shows. */
  private closed(coder: Coder): boolean {
    return coder.ended !== null && this.spec.reopenMinutes !== null;
  }

  /** The values an ended session's end screen uses (contracts EndValues): its message's and redirect link's references. */
  private async endValues(coder: Coder, values: Record<string, CoderValue>): Promise<EndValues | null> {
    const { ended } = coder;
    if (!ended) return null;
    const found = ended.item ? findEndItem(this.spec.design.items, ended.item) : null;
    // A panel return link from the deployment settings counts too
    const end = found ? resolveRedirects([found], this.spec.redirectUrls)[0] : null;
    const source = `${end?.message ?? ""}\n${end?.redirectUrl ?? ""}`;
    // Every `$var.x` / `$unit.x` written anywhere in them (texts, scripts, branch conditions).
    const names = (ns: string) =>
      new Set([...source.matchAll(new RegExp(`\\$${ns}\\.([A-Za-z0-9_]+)`, "g"))].map((m) => m[1]));
    const pick = <T>(values: Record<string, T>, wanted: Set<string>) =>
      Object.fromEntries(Object.entries(values).filter(([k]) => wanted.has(k)));
    const vars = names("var");
    let unit: EndValues["unit"] = null;
    if (ended.unit) {
      const [data, answers] = await Promise.all([
        this.getUnits([ended.unit.id]).then((units) => units.get(ended.unit!.id)?.data ?? {}),
        this.store.unitAnswers(coder.sessionId, ended.unit.id),
      ]);
      unit = { data: pick(data, names("unit")), variables: pick(answers, vars) };
    }
    return { variables: pick(plainValues(values), vars), unit };
  }

  /** How the coder's screen looks now (docs/client.md §4 "Display"): recorded when it changed. */
  async recordDisplay(coder: Coder, entry: DisplayEntry): Promise<void> {
    await this.store.recordDisplay(coder.sessionId, entry);
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
      await this.store.setEnded(coder.sessionId, coder.ended);
    }
    if (requestDeletion) {
      coder.deletionRequest = { at };
      await this.store.requestDeletion(coder.sessionId, coder.deletionRequest);
    }
  }

  private assertOpen(coder: Coder): void {
    if (coder.ended) throw new HttpError(409, "This session has ended", "session_ended");
  }

  /**
   * Coder-level answers: a row each (only those that changed), like unit
   * answers. Values for random conditions, and for frozen answers, are
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
    const randomNames = new Set(this.randomVariables.map(([name]) => name));
    const stored = await this.store.coderValues(coder.sessionId);
    const open = (name: string) => !randomNames.has(name) && !stored[name]?.assigned && !stored[name]?.frozen;
    const changed = Object.fromEntries(
      Object.entries(variables).filter(
        ([name, value]) => open(name) && JSON.stringify(stored[name]?.value) !== JSON.stringify(value),
      ),
    );
    // Timings of answered questions only (an unchanged answer: its timing alone is updated)
    const timed = Object.fromEntries(
      Object.entries(timings).filter(([name]) => open(name) && (name in changed || name in stored)),
    );
    if (Object.keys(changed).length === 0 && Object.keys(timed).length === 0) return;
    await this.store.checkAnswers(changed);
    await this.store.putCoderValues({
      sessionId: coder.sessionId,
      values: changed,
      designVersionId: this.spec.design.id,
      deviceId,
      timings: timed,
    });
  }

  // --- routing ----------------------------------------------------------------

  /** A set's units, as of the spec. */
  private unitsOf(set: string): number[] {
    return this.sets.get(set) ?? [];
  }

  /**
   * The share of a coder in a loop: from their session values (the coder,
   * an experiment's condition that selects units), or null while one of
   * them has no value (an experiment not reached yet, a coder without a
   * coder value). Cached by key, until the sets change (not an earlier
   * loop's units: those are the coder's own).
   */
  private shareOf(coder: Coder, loop: string, settings: ResolvedLoopUnits): Share | null {
    const columns = this.shareColumns.get(loop) ?? [];
    const values: [string, string][] = [];
    for (const c of columns) {
      const value = coder.session[c.name];
      if (value === undefined) return null;
      values.push([c.column, value]);
    }
    const { part, sameAs } = settings;
    // An earlier loop's units: the coder's own (fixed when they reach this loop, `route`), not cached
    const earlier = sameAs !== undefined ? coder.assignments[loop]?.units : undefined;
    // Everything the units depend on: the values, the part, and the overlap's settings (its count, how it's picked)
    const key =
      (sameAs !== undefined
        ? `session ${coder.sessionId} as ${sameAs}`
        : values.map(([column, value]) => `${column}=${value}`).join(",") || "all") +
      (part !== undefined ? ` | part ${part}` : "") +
      (settings.overlap && !["spread", "rate"].includes(settings.overlap.placement)
        ? ` | overlap ${settings.overlap.placement}`
        : "");
    const cached = sameAs === undefined ? this.shares.get(key) : undefined;
    if (cached) return cached;

    // The loop's part: its units; test units without a part are in every part
    const inPart = new Set(part !== undefined ? this.unitsOf(setKey(PART_SET, part)) : []);
    const withPart = new Set(
      part !== undefined ? (this.groups.get(PART_SET) ?? []).flatMap((p) => this.unitsOf(setKey(PART_SET, p))) : [],
    );
    const tests = (type: string) =>
      this.unitsOf(setKey(TEST_SET, type)).filter((id) => part === undefined || inPart.has(id) || !withPart.has(id));
    const testUnits = new Set(
      (this.groups.get(TEST_SET) ?? []).flatMap((type) => this.unitsOf(setKey(TEST_SET, type))),
    );
    let units: number[];
    if (sameAs !== undefined) units = earlier ?? [];
    else if (values.length === 0) units = this.unitsOf(ALL_UNITS_SET);
    else {
      // In every column: the value's units
      const [first, ...rest] = values.map(([column, value]) => this.unitsOf(setKey(column, value)));
      const others = rest.map((list) => new Set(list));
      units = [...new Set(first)].filter((id) => others.every((o) => o.has(id)));
    }
    if (part !== undefined) units = units.filter((id) => inPart.has(id));
    const overlap = tests("overlap");
    const share: Share = {
      key,
      own: units.filter((id) => !testUnits.has(id)),
      // Taking an earlier loop's units: the overlap units among them
      overlap: sameAs !== undefined ? units.filter((id) => overlap.includes(id)) : overlap,
      practice: tests("practice"),
      gold: tests("gold"),
      ...(sameAs !== undefined && earlier === undefined ? { pending: true } : {}),
    };
    if (sameAs === undefined) this.shares.set(key, share);
    return share;
  }

  /**
   * A route's test units (docs/architecture.md §6.2): its practice,
   * overlap and gold units, for those the loop places.
   */
  private specialUnits(route: Route): {
    set: string;
    type: TestSetType;
    units: number[];
    placement: "first" | "last" | "spread" | "rate";
    every?: number;
    rest?: "end" | "drop";
  }[] {
    return SPECIAL.flatMap(({ set, units, settings }) => {
      const s = settings(route.units);
      if (!s || s.placement === "disabled") return [];
      const list = units(route.share);
      return list.length > 0
        ? [
            {
              set: `${route.share.key}/${set}`,
              type: set,
              units: list,
              placement: s.placement,
              every: s.every,
              rest: s.rest,
            },
          ]
        : [];
    });
  }

  /** The units of one test unit type of a route (empty if it doesn't place it). */
  private specialSet(route: Route, set: string): number[] {
    return this.specialUnits(route).find((s) => s.set === `${route.share.key}/${set}`)?.units ?? [];
  }

  /** The coder's own units of a route, without the test units. */
  private ownUnits(route: Route): number[] {
    return route.units.own ? route.share.own : [];
  }

  /** All units of a route (own and test units). */
  private routeUnits(route: Route | null): Set<number> {
    return new Set(route ? [...this.ownUnits(route), ...this.specialUnits(route).flatMap((s) => s.units)] : []);
  }

  /** How many units the coder will get in a loop, if that doesn't depend on other coders. */
  private expectedUnits(route: Route | null): number | null {
    if (!route || route.share.pending) return null;
    const { criteria } = route.units;
    const size = this.ownUnits(route).length;
    const max = criteria?.unitsPerCoder?.max;
    const own = criteria ? (max === undefined ? null : Math.min(max, size)) : size;
    return own === null ? null : own + this.specialUnits(route).reduce((n, s) => n + s.units.length, 0);
  }

  /** A route's pools, working on these codings and (shared queues) leases. */
  private pools(route: Route, codings: Codings, leases: Lease[]): Routed {
    const { units, share } = route;
    const main = new UnitPool(share.key, this.ownUnits(route), sharedDefaults(units), codings);
    // Every lease of the loop: shares overlap (`a;b`), and a unit leased in one share is taken in all
    main.loadLeases(leases.map((l) => ({ ...l, expires: new Date(l.expires).getTime() })));
    const extras = this.specialUnits(route).map((s): OverlapPlacement => ({
      pool: new UnitPool(s.set, s.units, null, codings),
      placement: PLACEMENTS[s.placement],
      ...(s.placement === "rate" ? { every: s.every ?? DEFAULT_RATE, rest: s.rest ?? "end" } : {}),
    }));
    return { units, main, extras };
  }

  /**
   * A coder's units in a loop: their share, from their session values (null
   * while one of them has no value). Nothing is stored for this: a coder's
   * units follow from the session (docs/architecture.md §6), and the
   * units a coder coded stay theirs (`loopUnit`, `submitUnit`).
   */
  private routeOf(coder: Coder, info: LoopInfo): Route | null {
    const units = info.units;
    const share = this.shareOf(coder, info.key, units);
    return share ? { units, share } : null;
  }

  /**
   * A coder enters a loop: the experiment that selects its units, if the
   * coder hasn't reached it (e.g. it was hidden), is drawn now. Marks the coder as having reached the loop
   * (`coder_sessions.assignments`, for the progress counts). A session without a
   * value it needs (a coder from a link made before `coder_set` had
   * values) gets 409 `not_assigned`.
   */
  private async route(coder: Coder, info: LoopInfo): Promise<Route> {
    for (const column of this.shareColumns.get(info.key) ?? []) {
      if (column.random && coder.session[column.name] === undefined) await this.assignCondition(coder, column.name);
    }
    const route = this.routeOf(coder, info);
    if (!route)
      throw new HttpError(409, "No units are assigned to you yet: ask the researcher for a new link", "not_assigned");
    if (!coder.assignments[info.key]) {
      // Taking an earlier loop's units: the ones this coder finished there, in that order (fixed from now on)
      const sameAs = info.units.sameAs;
      const units =
        sameAs !== undefined
          ? (await this.store.listCodings({ sessionId: coder.sessionId, loop: sameAs })).map((c) => c.unitId)
          : undefined;
      const assignment = { at: this.options.now(), ...(units ? { units } : {}) };
      await this.store.routeCoder(coder.sessionId, info.key, assignment);
      coder.assignments = { ...coder.assignments, [info.key]: assignment };
      // An earlier loop's units are known now
      if (units) return this.routeOf(coder, info)!;
    }
    return route;
  }

  // --- units ------------------------------------------------------------------

  /**
   * The coder's next `count` units in a loop, in order (a batch: the client
   * asks again before it runs out); none when they are done with it. Units
   * they haven't finished: asked again, the same ones come first. In a
   * shared queue they are picked under the queue's lock, counting every
   * coder's codings and leases, and leased to the coder (a lease they hold
   * already is renewed).
   */
  async nextUnits(coder: Coder, loopName: string, count = 1): Promise<CoderUnitResponse[]> {
    this.assertOpen(coder);
    if (!this.spec.active) throw new HttpError(409, "This study is paused", "study_paused");
    const info = this.loops.get(loopName);
    if (!info) throw new HttpError(404, `No unit loop '${loopName}'`);
    const route = await this.route(coder, info);
    const units = route.units.criteria
      ? await this.pickShared({ coder, info, route, count })
      : (await this.pick(this.store, info, [{ coder, info, route, count }]))[0]!;
    return Promise.all(
      units.map(async (unit) => {
        const [shown, answers] = await Promise.all([
          this.markServed(coder.sessionId, unit),
          this.store.unitAnswers(coder.sessionId, unit.id),
        ]);
        return this.coderUnit(route, unit, shown.data, answers);
      }),
    );
  }

  /** Per shared queue: the requests waiting for its lock in this process. */
  private queueWaiting = new Map<string, PickWaiter[]>();

  /**
   * Picks from a shared queue under its lock (one lock for the whole loop,
   * since shares overlap: `a;b`). Requests that arrive while the
   * lock is busy are picked together in its next turn: one read of the
   * codings serves them all, which is what limits a busy queue.
   */
  private pickShared(request: PickRequest): Promise<Unit[]> {
    const key = request.info.key;
    return new Promise((resolve, reject) => {
      const waiting = this.queueWaiting.get(key);
      if (waiting) {
        waiting.push({ request, resolve, reject });
        return;
      }
      const queue: PickWaiter[] = [{ request, resolve, reject }];
      this.queueWaiting.set(key, queue);
      void (async () => {
        while (queue.length > 0) {
          const turn = takeTurn(queue);
          try {
            const picked = await this.store.locked(`queue/${key}`, (store) =>
              this.pick(
                store,
                request.info,
                turn.map((w) => w.request),
              ),
            );
            turn.forEach((w, i) => w.resolve(picked[i]!));
          } catch (e) {
            for (const w of turn) w.reject(e);
          }
        }
        this.queueWaiting.delete(key);
      })();
    });
  }

  /**
   * Picks each request's next units, in turn (and leases them, in a shared
   * queue); skips units that no longer exist. In a shared queue, a request
   * sees the units picked for the requests before it.
   */
  private async pick(store: Store, info: LoopInfo, requests: PickRequest[]): Promise<Unit[][]> {
    const shared = !!requests[0]!.route.units.criteria;
    // A shared queue counts every coder; otherwise only the coder's own codings matter.
    // Leases first: finishing a unit (not under this lock) adds the coding and
    // drops the lease, so a coding finished in between is still seen, as a coding.
    const leases = shared ? await store.listLeases({ loop: info.key }) : [];
    const rows = await store.listCodings(
      shared ? { loop: info.key } : { loop: info.key, sessionId: requests[0]!.coder.sessionId },
    );
    const codings = DeploymentRuntime.codingsOf(rows);
    const units = new Map<number, Unit>();
    const newLeases: Lease[] = [];
    const result: Unit[][] = [];
    for (const { coder, route, count } of requests) {
      const { main, extras } = this.pools(route, codings, leases);
      // Picks ids first, then reads them in one query: a unit deleted since the
      // spec was read is dropped from the pools and another one picked.
      const picked: { unitId: number; pool: UnitPool }[] = [];
      for (;;) {
        const wanted: typeof picked = [];
        while (picked.length + wanted.length < count) {
          const now = this.options.now();
          const next = pickNext(main, extras, coder.sessionId, codings, {
            order: info.loop.order ?? "sequential",
            maxUnits: route.units.criteria?.unitsPerCoder?.max,
            minUnits: route.units.criteria?.unitsPerCoder?.min,
            seed: this.spec.studyId * 1000,
            now,
          });
          if (!next) break;
          if (next.pool.rule) next.pool.take(coder.sessionId, next.unitId, now);
          // As if finished, for the rest of this turn: the next pick moves on (and counts it for
          // `maxUnits` and the overlap's place), and so do the next requests' picks.
          codings.record(coder.sessionId, next.unitId, {}, now);
          wanted.push(next);
        }
        if (wanted.length === 0) break;
        const unknown = wanted.map((w) => w.unitId).filter((id) => !units.has(id));
        if (unknown.length > 0) for (const [id, unit] of await this.getUnits(unknown, store)) units.set(id, unit);
        const missing = wanted.filter((w) => !units.has(w.unitId));
        for (const { unitId } of missing) {
          main.removeUnit(unitId);
          for (const extra of extras) extra.pool.removeUnit(unitId);
        }
        picked.push(...wanted.filter((w) => units.has(w.unitId)));
        if (missing.length === 0) break;
      }
      const now = this.options.now();
      for (const p of picked) {
        if (!p.pool.rule) continue;
        const lease = {
          loop: info.key,
          set: p.pool.set,
          sessionId: coder.sessionId,
          unitId: p.unitId,
          expires: new Date(now + p.pool.rule.leaseSeconds * 1000),
        };
        newLeases.push(lease);
        leases.push(lease);
      }
      result.push(picked.map((p) => units.get(p.unitId)!));
    }
    await store.putLeases(newLeases);
    return result;
  }

  /**
   * A unit the coder already worked on in a loop (has answers for, or holds
   * a lease on), so a resumed session can navigate back to it.
   */
  async loopUnit(coder: Coder, loopName: string, unitId: number): Promise<CoderUnitResponse> {
    if (this.closed(coder)) throw new HttpError(409, "This session has ended", "session_closed");
    if (!this.loops.has(loopName)) throw new HttpError(404, `No unit loop '${loopName}'`);
    const route = this.routeOf(coder, this.loops.get(loopName)!);
    const [answers, leases, coded] = await Promise.all([
      this.store.unitAnswers(coder.sessionId, unitId),
      this.store.listLeases({ sessionId: coder.sessionId }),
      this.store.listCodings({ loop: loopName, sessionId: coder.sessionId }),
    ]);
    const answered = Object.keys(answers).length > 0;
    const held = leases.some((l) => l.loop === loopName && l.unitId === unitId);
    // A unit the coder coded here stays theirs, also if the units were divided differently since
    const codedHere = coded.some((c) => c.unitId === unitId);
    // Only units the coder has worked on (or holds): no peeking ahead.
    if (!(this.routeUnits(route).has(unitId) || codedHere) || !(answered || held))
      throw new HttpError(404, "This unit is not part of your session");
    const unit = (await this.getUnits([unitId])).get(unitId);
    if (!unit) throw new HttpError(404, "Unit not found");
    const shown = await this.markServed(coder.sessionId, unit);
    return this.coderUnit(route, unit, shown.data, answers);
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
  ): Promise<SubmitUnitResponse> {
    this.assertOpen(coder);
    const loops = await this.submittableLoops(coder, unitId, loopName);
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
    let unitVersionId = (await this.store.servedVersion(coder.sessionId, unitId)) ?? undefined;
    if (unitVersionId === undefined) {
      const unit = (await this.getUnits([unitId])).get(unitId);
      unitVersionId = unit && (await this.shownVersion(unit)).versionId;
    }
    // The loops these answers (with the unit's earlier ones) finish the unit in.
    const merged = { ...(await this.store.unitAnswers(coder.sessionId, unitId)), ...variables };
    const codings = finishedLoops(merged, this.loops.values()).map((l) => ({
      loop: l.key,
      agreement: agreementKeys(merged, l),
    }));
    await this.store.putAnnotation({
      unitId,
      sessionId: coder.sessionId,
      variables,
      designVersionId: this.spec.design.id,
      unitVersionId,
      deviceId,
      timings: Object.fromEntries(Object.entries(timings).filter(([name]) => name in variables)),
      codings,
    });
    // The coder-level answers this loop depends on can't change any more.
    await this.store.freezeCoderValues(coder.sessionId, this.dependencies.get(info.key) ?? []);

    // Gold units (docs/architecture.md §6.2): checked here, against the unit's answer columns (practice: in the browser).
    const route = this.routeOf(coder, info);
    if (!route) return {};
    const response: SubmitUnitResponse = {};
    const { gold } = route.units;
    if (gold?.health && this.specialSet(route, "gold").includes(unitId)) {
      const health = await this.goldHealth(coder, info.key, gold, this.specialSet(route, "gold"));
      if (health <= 0) {
        await this.endSession(coder, gold.health.end);
        response.end = gold.health.end;
      }
    }
    return response;
  }

  /**
   * The loops (`loopName`: only that one) the coder may submit this unit in:
   * units in their route; in a shared queue only their own earlier codings
   * (editing after going back) or the unit leased to them (an expired lease
   * still counts: at worst one coding too many).
   */
  private async submittableLoops(coder: Coder, unitId: number, loopName?: string): Promise<LoopInfo[]> {
    // Leases first (as in `pick`): a submit of this unit finishing in between shows up as a coding.
    const leases = await this.store.listLeases({ sessionId: coder.sessionId });
    const own = await this.store.listCodings({ sessionId: coder.sessionId });
    const canSubmit = (info: LoopInfo) => {
      // A unit the coder coded here stays theirs (editing after going back), also if the units were divided differently since
      if (own.some((c) => c.loop === info.key && c.unitId === unitId)) return true;
      const route = this.routeOf(coder, info);
      if (!route) return false;
      if (this.specialUnits(route).some((s) => s.units.includes(unitId))) return true;
      if (!this.ownUnits(route).includes(unitId)) return false;
      if (!route.units.criteria) return true;
      return leases.some((l) => l.loop === info.key && l.unitId === unitId);
    };
    return [...this.loops.values()].filter(
      (info) => (loopName === undefined || info.key === loopName) && canSubmit(info),
    );
  }

  /**
   * A unit as the coder gets it. `$unit.test_set` is the test set the loop
   * places it in (null for a coding unit): sent when the design uses it, and
   * always on practice units (instructions can open on them). A practice unit
   * comes with its checks: the answer cells of the loop's practice questions
   * and their feedback, checked in the browser (docs/architecture.md §6.2).
   * Gold cells never leave the server.
   */
  private coderUnit(
    route: Route | null,
    unit: { id: number; externalId: string; data: UnitData },
    shown: UnitData,
    answers: Record<string, VariableValue>,
  ): CoderUnitResponse {
    const base = { id: unit.id, externalId: unit.externalId, variables: answers };
    const testSet = (route && this.specialUnits(route).find((s) => s.units.includes(unit.id))?.type) ?? null;
    const data =
      testSet === "practice" || this.shownFields.includes(TEST_SET) ? { ...shown, test_set: testSet } : shown;
    if (!route || testSet !== "practice") return { ...base, data };
    const practice = route.units.practice;
    const questions: NonNullable<CoderUnitResponse["practice"]>["questions"] = {};
    for (const name of practice?.questions ?? []) {
      const key = String(unit.data[answerColumn(name)] ?? "").trim();
      if (!parseAnswerKey(key)) continue;
      const message = String(unit.data[feedbackColumn(name)] ?? "").trim();
      questions[name] = { key, ...(message ? { message } : {}) };
    }
    const checks =
      Object.keys(questions).length > 0
        ? {
            practice: {
              retry: practice?.retry ?? true,
              ...(practice?.message ? { message: practice.message } : {}),
              questions,
            },
          }
        : {};
    return { ...base, data, ...checks };
  }

  /**
   * A coder's gold health in a loop: it starts at `start`, and each checked
   * question on a gold unit they finished changes it, in the order they
   * finished them: `wrong` when wrong, `right` when right (never above
   * `start`). Rebuilt from their answers and the units' answer columns.
   */
  private async goldHealth(
    coder: Coder,
    loop: string,
    gold: NonNullable<ResolvedLoopUnits["gold"]>,
    goldUnits: number[],
  ): Promise<number> {
    const health = gold.health!;
    const codings = (await this.store.listCodings({ sessionId: coder.sessionId, loop }))
      .filter((c) => goldUnits.includes(c.unitId))
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
    const units = await this.getUnits(codings.map((c) => c.unitId));
    let value = health.start;
    for (const coding of codings) {
      const unit = units.get(coding.unitId);
      if (!unit) continue;
      const answers = await this.store.unitAnswers(coder.sessionId, coding.unitId);
      for (const name of gold.questions ?? []) {
        const expected = parseAnswerKey(unit.data[answerColumn(name)]);
        if (expected === null) continue;
        value = answerMatchesKey(answers[name], expected)
          ? Math.min(health.start, value + (health.right ?? 0))
          : value + health.wrong;
      }
    }
    return value;
  }

  get version(): number {
    return this.spec.version;
  }

  /** Progress per loop and set: from every coder's codings, routing and leases. */
  async status(): Promise<DeploymentStatus> {
    const now = this.options.now();
    const [rows, allCoders, leases] = await Promise.all([
      this.store.listCodings({}),
      this.store.listCoders(),
      this.store.listLeases({}),
    ]);
    const sources: DeploymentStatus["sources"] = [];
    for (const [loop, info] of this.loops) {
      const codings = DeploymentRuntime.codingsOf(rows.filter((r) => r.loop === loop));
      const routes = allCoders.flatMap((c) => {
        const route = c.assignments[loop] ? this.routeOf(c, info) : null;
        return route ? [{ sessionId: c.sessionId, route }] : [];
      });
      // One row per pool: a set with its rule (a shared queue, or handed out whole). The previous loop's units are
      // each coder's own: one row for all of them
      const found = new Map<string, { set: string; rule: UnitPool["rule"]; unitIds: number[]; coders: number[] }>();
      for (const { sessionId, route } of routes) {
        const routed = this.pools(route, codings, []);
        for (const pool of [routed.main, ...routed.extras.map((e) => e.pool)]) {
          const set = pool.set.replace(/^session \d+ as /, "as ");
          const key = `${set}/${JSON.stringify(pool.rule)}`;
          if (!found.has(key)) found.set(key, { set, rule: pool.rule, unitIds: [], coders: [] });
          const row = found.get(key)!;
          row.unitIds.push(...pool.unitIds);
          row.coders.push(sessionId);
        }
      }
      const loopLeases = leases
        .filter((l) => l.loop === loop)
        .map((l) => ({ ...l, expires: new Date(l.expires).getTime() }));
      // Shares overlap (`a;b`, test units): a unit is listed once, in the first row that has it
      const listed = new Set<number>();
      const pools: { pool: UnitPool; coders: number[] }[] = [];
      for (const { set, rule, unitIds, coders } of found.values()) {
        const pool = new UnitPool(
          set,
          [...new Set(unitIds)].filter((id) => !listed.has(id)),
          rule,
          codings,
        );
        pool.loadLeases(loopLeases);
        for (const id of pool.unitIds) listed.add(id);
        pools.push({ pool, coders });
      }
      for (const { pool, coders } of pools) {
        sources.push({
          loop: loopTitle(info.loop, loop),
          set: pool.set,
          ...pool.status(now, coders),
          coders: coders.length,
        });
      }
    }
    return {
      deploymentId: this.id,
      version: this.spec.version,
      active: this.spec.active,
      coders: allCoders.length,
      sources,
    };
  }

  /**
   * A unit as coders see it under this codebook (docs/architecture.md
   * §8.4): only the fields it uses (`shownUnitFields`), and the deployed
   * unit version (answers point to it). `$unit.id` is the unit's id, unless
   * the units have a field called id.
   */
  private async shownVersion(unit: Unit): Promise<{ data: UnitData; versionId: number }> {
    const data: UnitData = Object.fromEntries(
      this.shownFields.filter((f) => f in unit.data).map((f) => [f, unit.data[f]]),
    );
    if (this.shownFields.includes("id") && !("id" in unit.data)) data.id = unit.externalId;
    return { data, versionId: unit.versionId };
  }

  /** Records which version of a unit the coder was shown; returns it. */
  private async markServed(sessionId: number, unit: Unit): Promise<{ data: UnitData; versionId: number }> {
    const shown = await this.shownVersion(unit);
    await this.store.recordServe(sessionId, unit.id, shown.versionId);
    return shown;
  }

  private async getUnits(ids: number[], store: Store = this.store): Promise<Map<number, Unit>> {
    return new Map((await store.getUnits(ids, this.spec.liveUnits)).map((unit) => [unit.id, unit]));
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
