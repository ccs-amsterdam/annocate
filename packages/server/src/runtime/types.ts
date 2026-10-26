import type { CodebookResponse, UnitData, VariableValue } from "@annotinder/contracts";

// What the runtime reads from and writes to the database (store.ts). Not
// part of any API: coders get what the client API (contracts
// `clientEndpoints`) returns.

/** Everything the runtime needs to run a deployed job, minus unit content. */
export interface DeploymentSpec {
  jobId: number;
  version: number;
  active: boolean;
  codebook: CodebookResponse;
  /** All unitsets of the job, plus `__all__` (every unit id in the job). */
  unitsets: { name: string; unitIds: number[] }[];
  /**
   * Bumped whenever annotations change outside the runtime (e.g. a
   * researcher resets units), so it reloads what it derived from them.
   */
  annotationEpoch: number;
}

/** Unit content, for the runtime's cache. */
export interface Unit {
  id: number;
  externalId: string;
  data: UnitData;
  /** Content hash: different when `data` changes. Stored with annotations when a coder saw older content. */
  hash: string;
}

/**
 * unit_loop name -> the unitset names (placeholders resolved) this coder was
 * routed to, in source order. Stored so routing is sticky: a coder keeps
 * their units even if later answers or a codebook update would route them
 * differently.
 */
export type CoderAssignments = Record<string, string[]>;

/** A coder as the runtime sees it. No email or other identifying data. */
export interface Coder {
  coderId: number;
  /** Coder-level variables, including values preset by their invitation. */
  variables: Record<string, VariableValue>;
  assignments: CoderAssignments;
}

/** The coder for a session (docs/coder-identity.md). */
export interface ResolveCoderRequest {
  /** Hash of the session key (session.ts). */
  coderKey: string;
  /** Required the first time a coder key is seen, to create the coder from an invite. */
  inviteSecret?: string;
  /** Participant id from the URL, for invites with `participantFromUrl` (ignored otherwise). */
  participantId?: string;
  /**
   * The coder confirmed starting a new session although their participant
   * id already has one (on another device). Without it: 409
   * `participant_has_session`.
   */
  newSession?: boolean;
}

/** Full replace of the coder state the runtime manages. */
export interface CoderWrite {
  variables: Record<string, VariableValue>;
  assignments: CoderAssignments;
}

/** One coder's live values for one unit (the runtime's per-coder workspace). */
export interface CoderAnnotation {
  unitId: number;
  coderId: number;
  /** Live values only, by variable name, including ones from older codebook versions. */
  variables: Record<string, VariableValue>;
  /** First write of any live value for this unit: the unit's place in the coder's progress. */
  created: Date;
  updated: Date;
}

/**
 * The bulk query over annotations. Per group of variables: the rows where
 * *all* `variables` have a live value ("finished"), optionally with the
 * values of `values`.
 *
 * - `level: "unit"` (default): per (unit, coder). A group is a unit loop's
 *   questions: which units coders finished, plus agreement values.
 * - `level: "coder"`: per coder, over coder-level values (survey questions,
 *   `auto` variables; `unitId: null`).
 */
export interface FinishedRequest {
  loops: {
    /** Label echoed in the rows: the loop name for unit-level groups. */
    loop: string;
    level?: "unit" | "coder";
    variables: string[];
    values?: string[];
  }[];
  /** Only this coder's rows. */
  coderId?: number;
}

export interface Finished {
  loop: string;
  /** `null` for coder-level groups. */
  unitId: number | null;
  coderId: number;
  /** Earliest `created` of the group's live values. Orders a coder's progress. */
  created: Date;
  values?: Record<string, VariableValue>;
}

/**
 * One unit's answers from one coder: upserts a live value per given
 * variable; variables not given are left as they are. The runtime only
 * writes complete units (every variable of the loop, `skip` for unasked
 * questions).
 */
export interface AnnotationWrite {
  unitId: number;
  coderId: number;
  variables: Record<string, VariableValue>;
  /** The deployed codebook the coder answered under. */
  codebookId?: number;
  /** `hash` of the unit content the coder was shown. */
  unitHash?: string;
}
