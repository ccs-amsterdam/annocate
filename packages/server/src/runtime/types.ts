import type { DeviceDetails } from "../shared/devices.js";
import type { CodebookResponse, DeletionRequest, SessionEnd, UnitData, VariableValue } from "@annotinder/contracts";

// What the runtime reads from and writes to the database (store.ts). Not
// part of any API: coders get what the coder API (contracts
// `coderEndpoints`) returns.

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
  /** The job keeps finished sessions open (else they close: docs/coder-identity.md §9). */
  keepSessionsOpen: boolean;
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
 * Where a coder was routed in one unit_loop: the unitset names (references
 * filled in, chosen sets resolved) in the order of contracts
 * `branchUnitsets`, i.e. their own set, then the overlap. Stored so routing
 * is sticky: a coder keeps their units even if later answers or a codebook
 * update would route them differently.
 */
export interface LoopAssignment {
  unitsets: string[];
  /** When the coder was routed (ms); for `sets` mode, which counts recently active coders. */
  at: number;
}

/** unit_loop name -> where the coder was routed. */
export type CoderAssignments = Record<string, LoopAssignment>;

/** A coder as the runtime sees it. No email or other identifying data. */
export interface Coder {
  coderId: number;
  /** Coder-level variables, including values preset by their invitation. */
  variables: Record<string, VariableValue>;
  assignments: CoderAssignments;
  /** Set once the coder reached an `end` item or quit: the session is over. */
  ended: SessionEnd | null;
  /** Set once the coder asked for their answers to be deleted (`Store.requestDeletion`; not part of `CoderWrite`). */
  deletionRequest: DeletionRequest | null;
  /** `$session` values: `participant` (if any) and the URL parameters the invite required. Fixed when the coder starts. */
  session: Record<string, string>;
  /** The invite the coder joined with (for `invitation` mode loops). */
  inviteId: number | null;
  /** The email the session is linked to (the coder logged in once, docs/coder-identity.md §5); null without. */
  email: string | null;
}

/** The coder for a device's request (docs/coder-identity.md §4). */
export interface ResolveCoderRequest {
  /** This device's key for its session in this deployment (session.ts `coderKey`). */
  coderKey: string;
  /** The device's details, stored when the device joins a session. */
  device?: DeviceDetails;
  /** Required the first time a coder key is seen, to create the coder from an invite. */
  inviteSecret?: string;
  /** The page's URL parameters: the participant id and other values the invite requires (`sessionFromUrl`). */
  urlParams?: Record<string, string>;
  /**
   * The coder confirmed starting a new session although their participant
   * id already has one (on another device). Without it: 409
   * `participant_has_session`. Also: a device that has a session starts
   * a fresh one (previews' "start over").
   */
  newSession?: boolean;
  /**
   * The verified email of a login, when the invite takes logins (or there
   * is no invite: coming back on a new device). It is linked to the session
   * once; on a device without a session it finds the email's session in this
   * job (docs/coder-identity.md §5).
   */
  login?: { email: string };
}

/** A coder, and the device the request came from (`coder_devices`; null in previews). */
export interface ResolvedCoder {
  coder: Coder;
  deviceId: number | null;
}

/** Full replace of the coder state the runtime manages (their values are answer rows: `CoderValuesWrite`). */
export interface CoderWrite {
  assignments: CoderAssignments;
  ended: SessionEnd | null;
}

/** Coder-level values to write, a row each (`assigned`: by the server, not answered). */
export interface CoderValuesWrite {
  coderId: number;
  values: Record<string, VariableValue>;
  assigned?: boolean;
  codebookId?: number | null;
  deviceId?: number | null;
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
  /** The unit version the coder saw (`Store.unitVersion`). */
  unitVersionId?: number;
  /** The device the answers were given on (`coder_devices`). */
  deviceId?: number | null;
}
