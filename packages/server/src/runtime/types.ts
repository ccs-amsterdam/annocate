import type { DeviceDetails } from "../shared/devices.js";
import type { SessionRules } from "./sessionValues.js";
import type {
  AnswerTiming,
  DesignVersion,
  DeletionRequest,
  SessionEnd,
  UnitData,
  VariableValue,
} from "@annotinder/contracts";

// What the runtime reads from and writes to the database (store.ts). Not
// part of any API: coders get what the coder API (contracts
// `coderEndpoints`) returns.

/** Everything the runtime needs to run a deployed study, minus unit content. */
export interface DeploymentSpec {
  studyId: number;
  version: number;
  active: boolean;
  design: DesignVersion;
  /** The deployed units (docs/architecture.md §8.4); false: the drafts (a preview). */
  liveUnits: boolean;
  /** All sets coders get, keyed `group/set` (contracts `setKey`), plus `__all__` (every unit). */
  sets: { name: string; unitIds: number[] }[];
  /**
   * Bumped whenever annotations change outside the runtime (e.g. a
   * researcher resets units), so it reloads what it derived from them.
   */
  annotationEpoch: number;
  /** What returning coders who got new units are told (`{n}`: how many); null: nothing. */
  newUnitsMessage: string | null;
  /** How long coders can go back after finishing, in minutes; null: always (docs/coder-identity.md §9). */
  reopenMinutes: number | null;
  /** Deployment settings: the URL per `redirectSetting` name of end items (docs/architecture.md §5). */
  redirectUrls: Record<string, string>;
}

/** A unit's content, as the runtime reads it. */
export interface Unit {
  id: number;
  externalId: string;
  data: UnitData;
  /** Content hash: different when `data` changes. */
  hash: string;
  /** The unit version (`unit_versions`): what answers about it point to. */
  versionId: number;
}

/**
 * That a coder reached a loop (for the progress counts). Their units in it
 * follow from their session values, so nothing else is stored.
 */
interface LoopAssignment {
  /** When the coder first asked for the loop's units (ms). */
  at: number;
  /** A loop taking an earlier loop's units (contracts `sameAsPrevious`): the units this coder finished there, in order. */
  units?: number[];
}

/** loop key (contracts `unitLoops`) -> when the coder reached it. */
export type CoderAssignments = Record<string, LoopAssignment>;

/** A coder as the runtime sees it. No email or other identifying data. */
export interface Coder {
  sessionId: number;
  assignments: CoderAssignments;
  /** Set once the coder reached an `end` item or quit: the session is over. */
  ended: SessionEnd | null;
  /** Set once the coder asked for their answers to be deleted (`Store.requestDeletion`; not part of `CoderWrite`). */
  deletionRequest: DeletionRequest | null;
  /** `$session` values: `coder` (if any), `source`, the URL parameters and linked random conditions. Fixed once set. */
  session: Record<string, string>;
  /** The link the coder joined with. */
  linkId: number | null;
  /** The email the session is linked to (the coder logged in once, docs/coder-identity.md §5); null without. */
  email: string | null;
  /** How many units the coder had in the loops they reached when they last loaded the session (null: not yet). */
  knownUnits: number | null;
}

/** The coder for a device's request (docs/coder-identity.md §4). */
export interface ResolveCoderRequest {
  /** This device's key for its session in this deployment (session.ts `coderKey`). */
  coderKey: string;
  /** The device's details, stored when the device joins a session. */
  device?: DeviceDetails;
  /** Required the first time a coder key is seen, to create the coder from a link. */
  linkSecret?: string;
  /** The page's URL parameters: the coder id and the codebook's URL parameters (`sessionValues`). */
  urlParams?: Record<string, string>;
  /** What the deployed codebook asks of a new session (its Study entry; set by the runtime). */
  sessionRules?: SessionRules;
  /**
   * The coder confirmed starting a new session although their coder id
   * already has one (on another device). Without it: 409
   * `coder_has_session`. Also: a device that has a session starts
   * a fresh one (previews' "start over").
   */
  newSession?: boolean;
  /**
   * Reads the verified email of the device's login, if any. Asked only when
   * it matters, so coding needs no login lookups: to link a session to its
   * email, once, where the link takes logins (`linkable`); and on a device
   * without a session here, to find the email's session in this study
   * (docs/coder-identity.md §5).
   */
  login?: () => Promise<{ email: string } | null>;
  /** The link takes logins: a session without an email gets linked to the login. */
  linkable?: boolean;
  /** The study is paused: sessions that exist go on, no new ones start (409 `study_paused`). */
  paused?: boolean;
  /** On a `pick_name` link: the name the coder picked (`x-coder-name`). */
  pickedName?: string;
}

/** A coder, and the device the request came from (`session_devices`; null in previews). */
export interface ResolvedCoder {
  coder: Coder;
  deviceId: number | null;
}

/** A "continue on another device" link (docs/coder-identity.md §4). */
export interface Transfer {
  sessionId: number;
  /** The session's coder id: the new device gets a key for a link that carries it too. */
  coder: string | null;
  expires: Date;
}

/** A live coder-level answer (a row without a unit). */
export interface CoderValue {
  value: VariableValue;
  /** Set by the server (a drawn random condition): never changed. */
  assigned: boolean;
  /** A unit loop the coder coded in depends on it: never changed (`loopDependencies`). */
  frozen: boolean;
}

/** Coder-level values to write, a row each (`assigned`: by the server, not answered). */
export interface CoderValuesWrite {
  sessionId: number;
  values: Record<string, VariableValue>;
  assigned?: boolean;
  /** The deployed codebook the value was given (or assigned) under. */
  designVersionId: number;
  deviceId?: number | null;
  /**
   * How long the coder took per question, as their browser measured it (by
   * variable). A timing for a variable not in `values` (an answer looked at
   * again, not changed) updates that live row's timing only.
   */
  timings?: Record<string, AnswerTiming>;
}

/** A finished coding: a coder answered every question of a loop for a unit (`unit_codings`). */
export interface Coding {
  loop: string;
  unitId: number;
  sessionId: number;
  /** The coder's answers to the loop's agreement questions (`agreementKey`), by variable. */
  agreement: Record<string, string | null>;
  /** When the coder first finished it (orders their progress), and last changed it. */
  created: Date;
  updated: Date;
}

/** A unit of a shared queue handed out to a coder (`unit_leases`): one per coder per queue. */
export interface Lease {
  loop: string;
  set: string;
  sessionId: number;
  unitId: number;
  expires: Date;
}

/**
 * The bulk query over annotations. Per group of variables: the rows where
 * *all* `variables` have a live value ("finished"), optionally with the
 * values of `values`.
 *
 * - `level: "unit"` (default): per (unit, coder). A group is a unit loop's
 *   questions: which units coders finished, plus agreement values.
 * - `level: "coder"`: per coder, over coder-level values (survey questions,
 *   random conditions; `unitId: null`).
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
  sessionId?: number;
}

export interface Finished {
  loop: string;
  /** `null` for coder-level groups. */
  unitId: number | null;
  sessionId: number;
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
  sessionId: number;
  variables: Record<string, VariableValue>;
  /** The deployed codebook the coder answered under. */
  designVersionId: number;
  /** The unit version the coder saw (`Store.unitVersion`). */
  unitVersionId?: number;
  /** The device the answers were given on (`session_devices`). */
  deviceId?: number | null;
  /** How long the coder took per question, as their browser measured it (by variable). */
  timings?: Record<string, AnswerTiming>;
  /** The loops these answers finish the unit in, with the agreement answers (`Coding`). */
  codings?: { loop: string; agreement: Record<string, string | null> }[];
}
