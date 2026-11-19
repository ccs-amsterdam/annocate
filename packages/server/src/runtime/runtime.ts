import {
  type AnswerTiming,
  shownUnitFields,
  type UnitData,
  type AnyVariableType,
  ALL_UNITS_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  GOLD_SET,
  loopShareColumns,
  type ShareColumn,
  loopDependencies,
  loopTitle,
  seededShuffle,
  sessionItem,
  setKey,
  sharedDefaults,
  collectQuestions,
  goldColumn,
  practiceColumn,
  practiceMessageColumn,
  parseAnswerKey,
  answerMatchesKey,
  type GoldSettings,
  type SubmitUnitResponse,
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
  type LoopUnits,
  loopUnits,
  type TransferResponse,
  type TopLevelItem,
  type VariableValue,
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
import { loginRequired, type SessionRules } from "./sessionValues.js";
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
} from "./designItems.js";

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
 * A coder's units in a loop (docs/architecture.md §6): those whose
 * cells hold the session's values in every set column a value is linked to
 * (`_overlap` cells: in every share), within the loop's filter.
 * Shared by every coder with the same values: `key` names it (the pool of a
 * shared queue, its leases, a row of the status). The special units come
 * apart: the overlap (when the loop places it), practice and gold.
 */
interface Share {
  key: string;
  own: number[];
  overlap: number[];
  practice: number[];
  gold: number[];
}

/** A coder's units in a loop: the loop's settings, and their share. */
interface Route {
  units: LoopUnits;
  share: Share;
}

const PLACEMENTS = { first: "before", last: "after", spread: "spread", rate: "rate" } as const;

/** A route's pools, with the state they were loaded with. */
interface Routed {
  units: LoopUnits;
  main: UnitPool;
  /** The special sets' pools besides the coder's own units: practice, overlap, gold (in that order of precedence). */
  extras: OverlapPlacement[];
}

/** The special units a loop can mix in, in order of precedence when several are due. */
const SPECIAL = [
  { set: PRACTICE_SET, units: (s: Share) => s.practice, settings: (b: LoopUnits) => b.practice },
  {
    set: OVERLAP_SET,
    units: (s: Share) => s.overlap,
    settings: (b: LoopUnits) => (b.overlap?.placement === "disabled" ? undefined : b.overlap),
  },
  { set: GOLD_SET, units: (s: Share) => s.gold, settings: (b: LoopUnits) => b.gold },
] as const;

type RandomVariable = Extract<VariableType, { type: "random" }>;

/** How long a coder can go back after completing a session (docs/coder-identity.md §9). */
const REOPEN_MS = 15 * 60 * 1000;

/**
 * The coder runtime of one deployed study (docs/architecture.md §3).
 * Everything it works with is in the database and read per request: the
 * coder, their answers, units, finished codings (`unit_codings`) and the
 * leases of shared queues (`unit_leases`). Decisions that count other
 * coders (a shared queue's next unit, a set, a balanced group) run under a
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
  private coderVariableTypes = new Map<string, VariableType>();
  /** Loop key -> the coder-level questions it depends on (`loopDependencies`), frozen once a coder coded a unit there. */
  private dependencies = new Map<string, string[]>();
  private randomVariables: [string, RandomVariable][] = [];
  /** Set key (`group/set`, and `__all__`) -> its units in order. */
  private sets = new Map<string, number[]>();
  /** Set column -> its values (sets, without reserved ones). */
  private groups = new Map<string, string[]>();
  /** Every set column (with only reserved sets too): where practice and gold units come from. */
  private columns: string[] = [];
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
            keepSessionsOpen: spec.keepSessionsOpen,
            sets: spec.sets,
            redirectUrls: spec.redirectUrls,
            signIn: spec.signIn,
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
      items: resolveRedirects(toCoderItems(items), spec.redirectUrls),
    };
  }

  private applySets(spec: DeploymentSpec): void {
    this.sets = new Map(spec.sets.map((u) => [u.name, u.unitIds]));
    this.groups = new Map();
    this.shares = new Map();
    const columns = new Set<string>();
    for (const { name } of spec.sets) {
      const at = name.indexOf("/");
      if (at < 0) continue;
      const [group, set] = [name.slice(0, at), name.slice(at + 1)];
      columns.add(group);
      if (set.startsWith("_")) continue;
      if (!this.groups.has(group)) this.groups.set(group, []);
      this.groups.get(group)!.push(set);
    }
    this.columns = [...columns];
  }

  /** What the codebook asks of a new session (its Session item), the set columns' values, and sign-in. */
  private get sessionRules(): SessionRules {
    const items = this.spec.design.items as TopLevelItem[];
    return { item: sessionItem(items), setsOf: (group) => this.groups.get(group) ?? [], signIn: this.spec.signIn };
  }

  /** The URL parameter with the participant id (the codebook's Session item), if any: part of a device's session key. */
  get participantParam(): string | null {
    return sessionItem(this.spec.design.items as TopLevelItem[])?.participant?.param ?? null;
  }

  /** Coders log in to start: the study requires it, or coders are email addresses. */
  get needsLogin(): boolean {
    return loginRequired(this.sessionRules);
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
            coderId: row.coderId,
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
    for (const row of rows) codings.record(row.coderId, row.unitId, row.agreement, new Date(row.updated).getTime());
    return codings;
  }

  // --- coders -----------------------------------------------------------------

  /**
   * The coder for a coder key, created on first use (from the link, with
   * participant id / new-session confirmation, see docs/coder-identity.md).
   * Read from the database on every request: one indexed query.
   */
  resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    return this.store.resolveCoder({ ...request, paused: !this.spec.active, sessionRules: this.sessionRules });
  }

  /**
   * The coder reached a computed item (a random variable): its value, assigned now if the
   * coder has none yet (random, or balanced: the option the fewest coders
   * who reached it have, under a lock; with `stratify`, only among coders
   * with the same answers to those questions, or session values). Once
   * assigned it never changes. Coders who never reach it (screened out
   * before) don't count. A variable linked to a set column (`units`) draws
   * from its values unless it lists options, and its value is added to the
   * session's values: it selects the units of the loops after it.
   */
  async computeVariable(coder: Coder, name: string): Promise<VariableValue> {
    this.assertOpen(coder);
    const variable = this.randomVariables.find(([n]) => n === name)?.[1];
    if (!variable) throw new HttpError(404, `No computed item '${name}'`);
    const options =
      variable.options ?? (variable.units ? (this.groups.get(variable.units) ?? []).map((value) => ({ value })) : []);
    if (options.length === 0) throw new HttpError(409, `Computed item '${name}' has no values yet`);
    // Linked to units: the value goes into the session values, once (a session value never changes, so
    // the coder's units don't either); the session's value is the variable's
    const linked = async (value: VariableValue): Promise<VariableValue> => {
      const plain = valueOf(value);
      if (!variable.units || plain === undefined) return value;
      const kept = await this.store.setSessionValue(coder.coderId, name, String(plain));
      coder.session = { ...coder.session, [name]: kept };
      return kept === String(plain) ? value : singleValue(kept);
    };
    const stored = (await this.store.coderValues(coder.coderId))[name];
    if (stored) return linked(stored.value);
    // Already in the session (e.g. its answers were reset): the same value again, not a new draw
    const kept = variable.units ? coder.session[name] : undefined;
    const put = (store: Store, value: VariableValue) =>
      store.putCoderValues({
        coderId: coder.coderId,
        values: { [name]: value },
        assigned: true,
        designVersionId: this.spec.design.id,
      });
    if (variable.draw === "random" || kept !== undefined) {
      // Under the coder's own lock: two requests of this coder at once draw once (the first write wins)
      const value = await this.store.locked(`condition/${name}/${coder.coderId}`, async (store) => {
        const again = (await store.coderValues(coder.coderId))[name];
        if (again) return again.value;
        const value = singleValue(kept ?? this.drawWeighted(options));
        await put(store, value);
        return value;
      });
      return linked(value);
    }
    const stratify = variable.stratify ?? [];
    const value = await this.store.locked(`balanced/${name}`, async (store) => {
      // Another request of this coder may have assigned it meanwhile
      const again = (await store.coderValues(coder.coderId))[name];
      if (again) return again.value;
      const own = await store.coderValues(coder.coderId);
      const stratum = (values: Record<string, VariableValue | undefined>, session: Record<string, string>) =>
        JSON.stringify(
          stratify.map((s) =>
            s.startsWith("session.") ? (session[s.slice("session.".length)] ?? null) : (valueOf(values[s]) ?? null),
          ),
        );
      const mine = stratum(Object.fromEntries(Object.entries(own).map(([k, v]) => [k, v.value])), coder.session);
      const others = (await store.coderValuesOf([name, ...stratify.filter((s) => !s.startsWith("session."))]))
        .filter((c) => stratum(c.values, c.session) === mine)
        .map((c) => c.values[name]);
      const value = singleValue(DeploymentRuntime.leastUsed(options, others));
      await put(store, value);
      return value;
    });
    return linked(value);
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
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const expires = new Date(this.options.now() + this.options.transferTtlMs);
    await this.store.createTransfer(await sha256(token), {
      coderId: coder.coderId,
      participant: coder.session.participant ?? null,
      expires,
    });
    return { token, expiresAt: expires };
  }

  /**
   * Redeems a transfer token (once): the new device joins the session, with
   * its keys for it (`keys`, from the session's participant id: coder.ts).
   */
  async redeemTransfer(
    token: string,
    keys: (participantId: string | null) => Promise<string[]>,
    device: DeviceDetails,
  ): Promise<void> {
    const transfer = await this.store.redeemTransfer(await sha256(token), new Date(this.options.now()));
    if (!transfer) throw new HttpError(404, "This link has expired or was already used", "transfer_invalid");
    for (const key of await keys(transfer.participant)) await this.store.addDevice(transfer.coderId, key, device);
  }

  /** The session for the client. */
  async session(coder: Coder): Promise<SessionResponse> {
    const values = await this.store.coderValues(coder.coderId);
    const [endValues, codings] = await Promise.all([
      this.endValues(coder, values),
      this.store.listCodings({ coderId: coder.coderId }),
    ]);
    return {
      coderId: coder.coderId,
      studyId: this.spec.studyId,
      // Only what coding needs (contracts toCoderItems): not how units are handed out
      codebook: this.coderCodebook,
      version: this.spec.version,
      progress: [...this.loops.values()].map((info) => {
        const route = this.routeOf(coder, info);
        const units = this.routeUnits(route);
        return {
          set: info.key,
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
    // Without an item: the coder went through the whole study.
    const end = item === undefined ? null : findEndItem(this.spec.design.items, item);
    if (item !== undefined && !end) throw new HttpError(400, `No end item '${item}'`);
    if (
      unit &&
      (!this.loops.has(unit.loop) || Object.keys(await this.store.unitAnswers(coder.coderId, unit.id)).length === 0)
    ) {
      throw new HttpError(400, "The end's unit is not one you answered");
    }
    coder.ended = {
      ...(item ? { item } : {}),
      ...(unit ? { unit } : {}),
      outcome: end?.outcome ?? "complete",
      at: new Date(this.options.now()),
    };
    await this.store.setEnded(coder.coderId, coder.ended);
    return { reopen: this.reopen(coder) };
  }

  /**
   * Whether an ended session can be opened again: after completing it,
   * within `REOPEN_MS` (always, if the study keeps sessions open). Not after a
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

  /** An ended session is closed, unless the study keeps sessions open: the coder gets only what the end screen shows. */
  private closed(coder: Coder): boolean {
    return coder.ended !== null && !this.spec.keepSessionsOpen;
  }

  /** The values an ended session's end screen uses (contracts EndValues): its message's and redirect link's references. */
  private async endValues(coder: Coder, values: Record<string, CoderValue>): Promise<EndValues | null> {
    const { ended } = coder;
    if (!ended) return null;
    const found = ended.item ? findEndItem(this.spec.design.items, ended.item) : null;
    // A panel return link from the deployment settings counts too
    const end = found ? resolveRedirects([found], this.spec.redirectUrls)[0] : null;
    const source = `${end?.message ?? ""}\n${end?.redirectUrl ?? ""}`;
    // Every `$var.x` / `$unit.x` written anywhere in them (texts, scripts, block conditions).
    const names = (ns: string) =>
      new Set([...source.matchAll(new RegExp(`\\$${ns}\\.([A-Za-z0-9_]+)`, "g"))].map((m) => m[1]));
    const pick = <T>(values: Record<string, T>, wanted: Set<string>) =>
      Object.fromEntries(Object.entries(values).filter(([k]) => wanted.has(k)));
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
    const auto = new Set(this.randomVariables.map(([name]) => name));
    const stored = await this.store.coderValues(coder.coderId);
    const open = (name: string) => !auto.has(name) && !stored[name]?.assigned && !stored[name]?.frozen;
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
      coderId: coder.coderId,
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
   * values linked to a set column), or null while one of them has no value
   * (a computed item not reached yet, a coder without a coder value).
   * Cached by key, until the sets change.
   */
  private shareOf(coder: Coder, loop: string, settings: LoopUnits): Share | null {
    const columns = this.shareColumns.get(loop) ?? [];
    const values: [string, string][] = [];
    let coderColumn: string | null = null;
    for (const c of columns) {
      const value = coder.session[c.name];
      if (value === undefined) return null;
      values.push([c.column, value]);
      if (c.name === "coder" && !c.random) coderColumn = c.column;
    }
    const filter = settings.filter;
    // Everything the units depend on: the values, the filter, and the overlap's settings (its count, how it's picked)
    const key =
      (values.map(([column, value]) => `${column}=${value}`).join(",") || "all") +
      (filter
        ? ` | ${filter.column} ${filter.only ? "only" : "except"} ${(filter.only ?? filter.except ?? []).join(",")}`
        : "") +
      (settings.overlap ? ` | overlap ${JSON.stringify(settings.overlap)}` : "");
    const cached = this.shares.get(key);
    if (cached) return cached;

    // In every column: the value's units, and the column's overlap (in the first column's order)
    const special = new Set(
      this.columns.flatMap((c) => [...this.unitsOf(setKey(c, PRACTICE_SET)), ...this.unitsOf(setKey(c, GOLD_SET))]),
    );
    let units: number[];
    if (values.length === 0) units = this.unitsOf(ALL_UNITS_SET);
    else {
      const [first, ...rest] = values.map(([column, value]) => [
        ...this.unitsOf(setKey(column, value)),
        ...this.unitsOf(setKey(column, OVERLAP_SET)),
      ]);
      const others = rest.map((list) => new Set(list));
      units = [...new Set(first)].filter((id) => others.every((o) => o.has(id)));
    }
    units = units.filter((id) => !special.has(id));
    if (filter) {
      const listed = new Set(
        (filter.only ?? filter.except ?? []).flatMap((value) => this.unitsOf(setKey(filter.column, value))),
      );
      units = units.filter((id) => listed.has(id) === !!filter.only);
    }
    // The overlap apart when the loop places it (or leaves it out): the coder column's, when coders divide
    // the units (a condition column's `_overlap` is just in every condition: the coder's own units); else
    // of the session's columns, or (no column divides the units) of every column
    const overlapColumns = coderColumn
      ? [coderColumn]
      : values.length > 0
        ? values.map(([column]) => column)
        : this.columns;
    const overlapAll = new Set(overlapColumns.flatMap((column) => this.unitsOf(setKey(column, OVERLAP_SET))));
    let overlap = settings.overlap ? units.filter((id) => overlapAll.has(id)) : [];
    const own = settings.overlap ? units.filter((id) => !overlapAll.has(id)) : units;
    const max = settings.overlap?.max;
    if (max !== undefined && overlap.length > max) {
      overlap =
        settings.overlap?.pick === "random"
          ? seededShuffle(overlap, this.spec.studyId).slice(0, max)
          : overlap.slice(0, max);
    }
    const all = (set: string) => [...new Set(this.columns.flatMap((c) => this.unitsOf(setKey(c, set))))];
    const share: Share = { key, own, overlap, practice: all(PRACTICE_SET), gold: all(GOLD_SET) };
    this.shares.set(key, share);
    return share;
  }

  /**
   * A route's special units (docs/architecture.md §6.2): its practice,
   * overlap and gold units, for those the loop places.
   */
  private specialUnits(
    route: Route,
  ): {
    set: string;
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
        ? [{ set: `${route.share.key}/${set}`, units: list, placement: s.placement, every: s.every, rest: s.rest }]
        : [];
    });
  }

  /** The units of one special set of a route (empty if it doesn't place it). */
  private specialSet(route: Route, set: string): number[] {
    return this.specialUnits(route).find((s) => s.set === `${route.share.key}/${set}`)?.units ?? [];
  }

  /** The coder's own units of a route, without the special units. */
  private ownUnits(route: Route): number[] {
    return route.share.own;
  }

  /** All units of a route (own and special units). */
  private routeUnits(route: Route | null): Set<number> {
    return new Set(route ? [...this.ownUnits(route), ...this.specialUnits(route).flatMap((s) => s.units)] : []);
  }

  /** How many units the coder will get in a loop, if that doesn't depend on other coders. */
  private expectedUnits(route: Route | null): number | null {
    if (!route) return null;
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
    // Every lease of the loop: shares overlap (`_overlap`, `a;b`), and a unit leased in one share is taken in all
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
    const units = loopUnits(info.loop);
    const share = this.shareOf(coder, info.key, units);
    return share ? { units, share } : null;
  }

  /**
   * A coder enters a loop: the computed items linked to a set column that
   * select its units and that the coder hasn't reached (e.g. they were
   * hidden) are drawn now. Marks the coder as having reached the loop
   * (`coders.assignments`, for the progress counts). A session without a
   * value it needs (a coder from a link made before the coder column had
   * values) gets 409 `not_assigned`.
   */
  private async route(coder: Coder, info: LoopInfo): Promise<Route> {
    for (const column of this.shareColumns.get(info.key) ?? []) {
      if (column.random && coder.session[column.name] === undefined) await this.computeVariable(coder, column.name);
    }
    const route = this.routeOf(coder, info);
    if (!route)
      throw new HttpError(409, "No units are assigned to you yet: ask the researcher for a new link", "not_assigned");
    if (!coder.assignments[info.key]) {
      const assignment = { at: this.options.now() };
      await this.store.routeCoder(coder.coderId, info.key, assignment);
      coder.assignments = { ...coder.assignments, [info.key]: assignment };
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
    // A shared queue: one lock for the whole loop, since shares overlap (`_overlap`, `a;b`)
    const units = route.units.criteria
      ? await this.store.locked(`queue/${info.key}`, (store) => this.pick(store, coder, info, route, count))
      : await this.pick(this.store, coder, info, route, count);
    return Promise.all(
      units.map(async (unit) => {
        const [shown, answers] = await Promise.all([
          this.markServed(coder.coderId, unit),
          this.store.unitAnswers(coder.coderId, unit.id),
        ]);
        return this.coderUnit(route, unit, shown.data, answers);
      }),
    );
  }

  /** Picks the coder's next units (and leases them, in a shared queue); skips units that no longer exist. */
  private async pick(store: Store, coder: Coder, info: LoopInfo, route: Route, count: number): Promise<Unit[]> {
    const shared = !!route.units.criteria;
    // A shared queue counts every coder; otherwise only the coder's own codings matter.
    // Leases first: finishing a unit (not under this lock) adds the coding and
    // drops the lease, so a coding finished in between is still seen, as a coding.
    const leases = shared ? await store.listLeases({ loop: info.key }) : [];
    const rows = await store.listCodings(shared ? { loop: info.key } : { loop: info.key, coderId: coder.coderId });
    const codings = DeploymentRuntime.codingsOf(rows);
    const { main, extras } = this.pools(route, codings, leases);
    // Picks ids first, then reads them in one query: a unit deleted since the
    // spec was read is dropped from the pools and another one picked.
    const picked: { unitId: number; pool: UnitPool }[] = [];
    const units = new Map<number, Unit>();
    for (;;) {
      const wanted: typeof picked = [];
      while (picked.length + wanted.length < count) {
        const now = this.options.now();
        const next = pickNext(main, extras, coder.coderId, codings, {
          order: info.loop.order ?? "sequential",
          maxUnits: route.units.criteria?.unitsPerCoder?.max,
          minUnits: route.units.criteria?.unitsPerCoder?.min,
          seed: this.spec.studyId * 1000,
          now,
        });
        if (!next) break;
        if (next.pool.rule) next.pool.take(coder.coderId, next.unitId, now);
        // As if finished, for the rest of this batch: the next pick moves on (and counts it for `maxUnits` and the overlap's place).
        codings.record(coder.coderId, next.unitId, {}, now);
        wanted.push(next);
      }
      if (wanted.length === 0) break;
      for (const [id, unit] of await this.getUnits(
        wanted.map((w) => w.unitId),
        store,
      ))
        units.set(id, unit);
      const missing = wanted.filter((w) => !units.has(w.unitId));
      for (const { unitId } of missing) {
        main.removeUnit(unitId);
        for (const extra of extras) extra.pool.removeUnit(unitId);
      }
      picked.push(...wanted.filter((w) => units.has(w.unitId)));
      if (missing.length === 0) break;
    }
    const now = this.options.now();
    await store.putLeases(
      picked
        .filter((p) => p.pool.rule)
        .map((p) => ({
          loop: info.key,
          set: p.pool.set,
          coderId: coder.coderId,
          unitId: p.unitId,
          expires: new Date(now + p.pool.rule!.leaseSeconds * 1000),
        })),
    );
    return picked.map((p) => units.get(p.unitId)!);
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
      this.store.unitAnswers(coder.coderId, unitId),
      this.store.listLeases({ coderId: coder.coderId }),
      this.store.listCodings({ loop: loopName, coderId: coder.coderId }),
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
    const shown = await this.markServed(coder.coderId, unit);
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
    // Leases first (as in `pick`): a submit of this unit finishing in between shows up as a coding.
    const leases = await this.store.listLeases({ coderId: coder.coderId });
    const own = await this.store.listCodings({ coderId: coder.coderId });
    // Units in the coder's route; in a shared queue only their own earlier
    // codings (editing after going back) or the unit leased to them (an
    // expired lease still counts: at worst one coding too many).
    const routes = new Map<string, Route | null>();
    for (const info of this.loops.values()) {
      if (loopName === undefined || info.key === loopName) routes.set(info.key, this.routeOf(coder, info));
    }
    const canSubmit = (info: LoopInfo) => {
      // A unit the coder coded here stays theirs (editing after going back), also if the units were divided differently since
      if (own.some((c) => c.loop === info.key && c.unitId === unitId)) return true;
      const route = routes.get(info.key) ?? null;
      if (!route) return false;
      if (this.specialUnits(route).some((s) => s.units.includes(unitId))) return true;
      if (!this.ownUnits(route).includes(unitId)) return false;
      if (!route.units.criteria) return true;
      return leases.some((l) => l.loop === info.key && l.unitId === unitId);
    };
    const loops = [...this.loops.values()].filter(
      (info) => (loopName === undefined || info.key === loopName) && canSubmit(info),
    );
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
    const codings = finishedLoops(merged, this.loops.values()).map((l) => ({
      loop: l.key,
      agreement: agreementKeys(merged, l),
    }));
    await this.store.putAnnotation({
      unitId,
      coderId: coder.coderId,
      variables,
      designVersionId: this.spec.design.id,
      unitVersionId,
      deviceId,
      timings: Object.fromEntries(Object.entries(timings).filter(([name]) => name in variables)),
      codings,
    });
    // The coder-level answers this loop depends on can't change any more.
    await this.store.freezeCoderValues(coder.coderId, this.dependencies.get(info.key) ?? []);

    // Gold units (docs/architecture.md §6.2): checked here, against the unit's answer columns (practice: in the browser).
    const route = this.routeOf(coder, info);
    if (!route) return {};
    const response: SubmitUnitResponse = {};
    const { gold } = route.units;
    if (gold?.health && this.specialSet(route, GOLD_SET).includes(unitId)) {
      const health = await this.goldHealth(coder, info.key, gold, this.specialSet(route, GOLD_SET));
      if (health <= 0) {
        await this.endSession(coder, gold.health.end);
        response.end = gold.health.end;
      }
    }
    return response;
  }

  /**
   * A unit as the coder gets it. A practice unit is marked (`$unit._practice`)
   * and comes with its checks: the answer cells of the loop's practice
   * questions and their feedback, checked in the browser (docs/architecture.md §6.2).
   * Gold cells never leave the server.
   */
  private coderUnit(
    route: Route | null,
    unit: { id: number; externalId: string; data: UnitData },
    shown: UnitData,
    answers: Record<string, VariableValue>,
  ): CoderUnitResponse {
    const base = { id: unit.id, externalId: unit.externalId, variables: answers };
    if (!route || !this.specialSet(route, PRACTICE_SET).includes(unit.id)) return { ...base, data: shown };
    const practice = route.units.practice;
    const questions: NonNullable<CoderUnitResponse["practice"]>["questions"] = {};
    for (const name of practice?.questions ?? []) {
      const key = String(unit.data[practiceColumn(name)] ?? "").trim();
      if (!parseAnswerKey(key)) continue;
      const message = String(unit.data[practiceMessageColumn(name)] ?? "").trim();
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
    return { ...base, data: { ...shown, _practice: true }, ...checks };
  }

  /**
   * A coder's gold health in a loop: it starts at `start`, and each checked
   * question on a gold unit they finished changes it, in the order they
   * finished them: `wrong` when wrong, `right` when right (never above
   * `start`). Rebuilt from their answers and the units' answer columns.
   */
  private async goldHealth(coder: Coder, loop: string, gold: GoldSettings, goldUnits: number[]): Promise<number> {
    const health = gold.health!;
    const codings = (await this.store.listCodings({ coderId: coder.coderId, loop }))
      .filter((c) => goldUnits.includes(c.unitId))
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
    const units = await this.getUnits(codings.map((c) => c.unitId));
    let value = health.start;
    for (const coding of codings) {
      const unit = units.get(coding.unitId);
      if (!unit) continue;
      const answers = await this.store.unitAnswers(coder.coderId, coding.unitId);
      for (const name of gold.questions) {
        const expected = parseAnswerKey(unit.data[goldColumn(name)]);
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
        return route ? [{ coderId: c.coderId, route }] : [];
      });
      // One row per pool: a set with its rule (a shared queue, or handed out whole).
      const pools = new Map<string, { pool: UnitPool; coders: number[] }>();
      const loopLeases = leases
        .filter((l) => l.loop === loop)
        .map((l) => ({ ...l, expires: new Date(l.expires).getTime() }));
      // Shares overlap (`_overlap`, `a;b`): a unit is listed once, in the first row that has it
      const listed = new Set<number>();
      for (const { coderId, route } of routes) {
        const routed = this.pools(route, codings, []);
        for (const pool of [routed.main, ...routed.extras.map((e) => e.pool)]) {
          const key = `${pool.set}/${JSON.stringify(pool.rule)}`;
          if (!pools.has(key)) {
            const row = new UnitPool(
              pool.set,
              pool.unitIds.filter((id) => !listed.has(id)),
              pool.rule,
              codings,
            );
            row.loadLeases(loopLeases);
            for (const id of row.unitIds) listed.add(id);
            pools.set(key, { pool: row, coders: [] });
          }
          pools.get(key)!.coders.push(coderId);
        }
      }
      for (const { pool, coders } of pools.values()) {
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
   * unit version (answers point to it).
   */
  private async shownVersion(unit: Unit): Promise<{ data: UnitData; versionId: number }> {
    const data: UnitData = Object.fromEntries(
      this.shownFields.filter((f) => f in unit.data).map((f) => [f, unit.data[f]]),
    );
    return { data, versionId: unit.versionId };
  }

  /** Records which version of a unit the coder was shown; returns it. */
  private async markServed(coderId: number, unit: Unit): Promise<{ data: UnitData; versionId: number }> {
    const shown = await this.shownVersion(unit);
    await this.store.recordServe(coderId, unit.id, shown.versionId);
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
