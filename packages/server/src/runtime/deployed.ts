import {
  type AnyVariableType,
  type CoderCodebook,
  type ShareColumn,
  type TopLevelItem,
  type VariableValue,
  loopDependencies,
  loopShareColumns,
  resolveRedirects,
  sessionItem,
  shownUnitFields,
  toCoderItems,
} from "@annotinder/contracts";
import { Codings, type AgreementKeys } from "./distribution.js";
import {
  agreementKey,
  collectCoderVariables,
  collectLoops,
  loopAgreementVariables,
  type LoopInfo,
} from "./designItems.js";
import type { PickWaiter } from "./picking.js";
import type { Share } from "./shares.js";
import type { Store } from "./store.js";
import type { CoderValue, Coding, DeploymentSpec } from "./types.js";

export interface RuntimeOptions {
  /** How long a "continue on another device" link stays valid. */
  transferTtlMs: number;
  /** A loaded deployment nobody used for this long is dropped (registry.ts). */
  deploymentIdleMs: number;
  /** At most this many deployments are loaded at once: then the one used longest ago is dropped (registry.ts). */
  maxDeployments: number;
  now: () => number;
  random: () => number;
}

export const DEFAULT_RUNTIME_OPTIONS: RuntimeOptions = {
  transferTtlMs: 15 * 60_000,
  deploymentIdleMs: 6 * 60 * 60_000,
  maxDeployments: 200,
  now: () => Date.now(),
  random: Math.random,
};

export type ExperimentVariable = Extract<AnyVariableType, { type: "experiment" }>;

/**
 * A deployment as the runtime read it (`DeploymentRuntime.load`, `refresh`):
 * the spec and what is looked up in it per request, with the store and the
 * options. What the runtime does (shares.ts, picking.ts, submit.ts, ...)
 * are functions on this.
 */
export class Deployed {
  spec!: DeploymentSpec;
  loops = new Map<string, LoopInfo>();
  coderVariableTypes = new Map<string, AnyVariableType>();
  /** Loop key -> the coder-level questions it depends on (`loopDependencies`), frozen once a coder coded a unit there. */
  dependencies = new Map<string, string[]>();
  randomVariables: [string, ExperimentVariable][] = [];
  /** Set key (`column/set`, and `__all__`) -> its units in order. */
  sets = new Map<string, number[]>();
  /** Column with a role -> its values (sets). */
  groups = new Map<string, string[]>();
  /** Loop key -> the session values that select its units (contracts `loopShareColumns`). */
  shareColumns = new Map<string, ShareColumn[]>();
  /** Shares computed from the current sets, by key. */
  shares = new Map<string, Share>();
  /** The unit fields the design shows (`shownUnitFields`): all coders get. */
  shownFields: string[] = [];
  /** What coders get of the design (contracts `toCoderItems`). */
  coderCodebook!: CoderCodebook;
  /** Per shared queue: the requests waiting for its lock in this process (picking.ts). */
  queueWaiting = new Map<string, PickWaiter[]>();

  constructor(
    readonly id: string,
    readonly store: Store,
    readonly options: RuntimeOptions,
  ) {}

  /** A new spec (a deploy, or a reset of answers): everything is looked up again. */
  applySpec(spec: DeploymentSpec): void {
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
      (e): e is [string, ExperimentVariable] => e[1].type === "experiment",
    );
    this.shareColumns = loopShareColumns(items);
    this.applySets(spec);
    this.shownFields = shownUnitFields(items);
    this.coderCodebook = {
      id: spec.design.id,
      title: spec.design.public?.title ?? null,
      ...(sessionItem(items)?.display ? { display: sessionItem(items)!.display } : {}),
      items: resolveRedirects(toCoderItems(items), spec.redirectUrls),
    };
  }

  /** The same version with other settings or sets (units added, moved between coders). */
  applySettings(spec: DeploymentSpec): void {
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
}

/** Stored coder-level answers as plain values. */
export const plainValues = (values: Record<string, CoderValue>) =>
  Object.fromEntries(Object.entries(values).map(([name, v]) => [name, v.value]));

/** Finished codings as distribution reads them. */
export function codingsOf(rows: Coding[]): Codings {
  const codings = new Codings();
  for (const row of rows) codings.record(row.sessionId, row.unitId, row.agreement);
  return codings;
}

/** The answers to a loop's agreement questions, as distribution compares them. */
export function agreementKeys(variables: Record<string, VariableValue>, info: LoopInfo): AgreementKeys {
  return Object.fromEntries(loopAgreementVariables(info).map((v) => [v, agreementKey(variables, v)]));
}
