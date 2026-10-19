import { createHash } from "node:crypto";
import {
  ALL_UNITS_UNITSET,
  type AnnotatorCoder,
  type CoderAssignments,
  type ConformanceFixture,
  type DeploymentSpec,
  type UnitData,
  type VariableValue,
} from "@annotinder/contracts";

// The reference db server's data: one job, in memory, loaded from a fixture.
// A real db server stores the same things in its database (README.md).

export interface Invite {
  secret: string;
  auth: "none" | "optional" | "required";
  maxUses?: number;
  uses: number;
  participantId?: string;
  participantFromUrl?: boolean;
  variables: Record<string, string>;
}

export interface Coder {
  id: number;
  key: string;
  participantId?: string;
  /** Sticky loop routing: distribution state, not annotations, so kept here. */
  assignments: CoderAssignments;
}

/**
 * One value of one variable, for one unit and coder. Coder-level values
 * (survey questions, `auto` variables) are the same rows with `unitId: null`.
 * Retired values stay, but no longer count.
 */
export interface Value {
  unitId: number | null;
  coderId: number;
  variable: string;
  value: VariableValue;
  codebookId?: number;
  /** Hash of the unit content the coder was shown (unit-level values). */
  unitHash?: string;
  created: Date;
  updated: Date;
  retiredAt?: Date;
}

export interface Unit {
  id: number;
  externalId: string;
  data: UnitData;
  /** Content hash: must change whenever `data` does. */
  hash: string;
}

export interface Store {
  spec: DeploymentSpec;
  /** The job server this job is deployed to: only it gets job tokens (plan §13). */
  jobServerUrl: string | null;
  units: Map<number, Unit>;
  invites: Invite[];
  coders: Coder[];
  values: Value[];
}

/** Loads a fixture as job `jobId`, deployed as version 1 to `jobServerUrl`. */
export function loadFixture(fixture: ConformanceFixture, jobId = 1, jobServerUrl: string | null = null): Store {
  // Units never change here; a db server that lets them change must change the hash too.
  const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
  const units = new Map(fixture.units.map((u, i) => [i + 1, { id: i + 1, ...u, hash: hash(u.data) }]));
  const idOf = new Map([...units.values()].map((u) => [u.externalId, u.id]));
  return {
    jobServerUrl,
    spec: {
      jobId,
      version: 1,
      active: true,
      annotationEpoch: 0,
      codebook: { id: 1, jobId, items: fixture.codebook.items, note: fixture.codebook.note ?? null, created: new Date(), immutable: true },
      unitsets: [
        { name: ALL_UNITS_UNITSET, unitIds: [...units.keys()] },
        ...fixture.unitsets.map((u) => ({ name: u.name, unitIds: u.externalIds.map((e) => idOf.get(e)!) })),
      ],
    },
    units,
    invites: fixture.invites.map((i) => ({ ...i, uses: 0, variables: i.variables ?? {} })),
    coders: [],
    values: [],
  };
}

export const isLive = (v: Value) => v.retiredAt === undefined;

export function liveValue(store: Store, unitId: number | null, coderId: number, variable: string): Value | undefined {
  return store.values.find((v) => isLive(v) && v.unitId === unitId && v.coderId === coderId && v.variable === variable);
}

/** Upserts a live value per variable; others are left alone. */
export function upsertValues(
  store: Store,
  unitId: number | null,
  coderId: number,
  variables: Record<string, VariableValue>,
  meta: { codebookId?: number; unitHash?: string } = {},
): void {
  const now = new Date();
  for (const [variable, value] of Object.entries(variables)) {
    const existing = liveValue(store, unitId, coderId, variable);
    if (existing) Object.assign(existing, { value, updated: now, ...meta });
    else store.values.push({ unitId, coderId, variable, value, ...meta, created: now, updated: now });
  }
}

/** A coder as the job server sees it: coder-level values and loop assignments. */
export function toAnnotatorCoder(store: Store, coder: Coder): AnnotatorCoder {
  return {
    coderId: coder.id,
    variables: Object.fromEntries(
      store.values
        .filter((v) => isLive(v) && v.unitId === null && v.coderId === coder.id)
        .map((v) => [v.variable, v.value]),
    ),
    assignments: coder.assignments,
  };
}
