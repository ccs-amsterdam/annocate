import { z } from "zod";
import { IdSchema, UnitDataSchema } from "./common.js";
import { CodebookResponseSchema } from "./codebook/codebook.js";
import { VariableValueSchema } from "./variableValue.js";

// Contracts for the db-server <-> job-server split (see docs/architecture.md).
//
//  - db server:  source of truth for jobs, codebooks, units, coders and
//                annotations. Any language. Implements the "backend API"
//                below, which only the job server calls.
//  - job server: the annotinder runtime (packages/job-server). Coders talk
//                only to the job server; it distributes units (as described
//                by the codebook's unit_loops), validates annotations and
//                writes them through to the db server. Holds no state that
//                cannot be rebuilt from the backend API.

/** Researcher-facing: `PUT /job/:jobId/deployment` on the db server. */
export const DeploymentWriteSchema = z.object({
  codebookId: IdSchema,
  /** Set to false to stop the job server from handing out units (coders get a 409). */
  active: z.boolean().default(true),
});
export type DeploymentWrite = z.infer<typeof DeploymentWriteSchema>;

export const DeploymentResponseSchema = DeploymentWriteSchema.extend({
  jobId: IdSchema,
  /** Bumped on every change, so the job server can detect a stale cached spec. */
  version: z.number().int().positive(),
  updated: z.coerce.date(),
  /**
   * Things the researcher should know about this deploy, e.g. that a loop
   * gained questions, which reopens units coders already finished.
   */
  warnings: z.array(z.string()).optional(),
});
export type DeploymentResponse = z.infer<typeof DeploymentResponseSchema>;

/**
 * Researcher-facing: `POST /job/:jobId/annotations/reset`. Retires the live
 * values of these variables (e.g. all questions of a loop), optionally only
 * for some units or coders. Nothing is deleted: retired values stay for
 * analysis, and the units count as unfinished again.
 */
export const ResetAnnotationsSchema = z.object({
  variables: z.array(z.string()).min(1),
  unitIds: z.array(IdSchema).optional(),
  coderIds: z.array(IdSchema).optional(),
});
export type ResetAnnotations = z.infer<typeof ResetAnnotationsSchema>;

// ---------------------------------------------------------------------------
// Backend API: implemented by the db server, called only by the job server.
// Authenticated with `authorization: Bearer <shared secret>`.
// ---------------------------------------------------------------------------

/** `GET /backend/job/:jobId/deployment` -- everything the job server needs to run the job, minus unit content. */
export const DeploymentSpecSchema = z.object({
  jobId: IdSchema,
  version: z.number().int().positive(),
  active: z.boolean(),
  codebook: CodebookResponseSchema,
  /** All unitsets of the job, plus `__all__` (every unit id in the job). */
  unitsets: z.array(z.object({ name: z.string(), unitIds: z.array(IdSchema) })),
  /**
   * Bumped whenever annotations change outside the job server (e.g. a
   * researcher resets units), so the job server reloads what it derived
   * from them.
   */
  annotationEpoch: z.number().int().nonnegative().default(0),
});
export type DeploymentSpec = z.infer<typeof DeploymentSpecSchema>;

/** `GET /backend/job/:jobId/units?ids=1,2,3` -- unit content, for the job server's cache. */
export const BackendUnitSchema = z.object({
  id: IdSchema,
  externalId: z.string(),
  data: UnitDataSchema,
  /**
   * Content hash: opaque to the job server, the same as long as `data` is,
   * and different when it changes. Sent back as `unitHash` with
   * annotations, so a db server can tell what content a coder was shown.
   */
  hash: z.string().min(1),
});
export type BackendUnit = z.infer<typeof BackendUnitSchema>;

/**
 * unit_loop name -> the unitset names (placeholders resolved) this coder was
 * routed to, in source order. Stored so routing is sticky: a coder keeps
 * their units even if later answers or a codebook update would route them
 * differently.
 */
export const CoderAssignmentsSchema = z.record(z.string(), z.array(z.string()));
export type CoderAssignments = z.infer<typeof CoderAssignmentsSchema>;

/** A coder as the job server sees it. No email or other identifying data. */
export const BackendCoderSchema = z.object({
  coderId: IdSchema,
  /** Coder-level variables, including values preset by their invitation. */
  variables: z.record(z.string(), VariableValueSchema),
  assignments: CoderAssignmentsSchema.default({}),
});
export type BackendCoder = z.infer<typeof BackendCoderSchema>;

/** `POST /backend/job/:jobId/coders/resolve` */
export const ResolveCoderRequestSchema = z.object({
  /** Client-generated, persisted coder key (dev-mode coder auth; see mock-server auth.ts). */
  coderKey: z.string().min(1),
  /**
   * Required the first time a coderKey is seen, to create the coder from an
   * invite. The db server copies the invite's preset `variables` into the
   * new coder's variables.
   */
  inviteSecret: z.string().optional(),
  /** Participant id from the URL, for invites with `participantFromUrl` (ignored otherwise). */
  participantId: z.string().min(1).max(256).optional(),
  /**
   * The coder confirmed starting a new session although their participant id
   * already has one (on another device). Without it, the db server answers
   * 409 `participant_has_session` instead of creating a second coder.
   */
  newSession: z.boolean().optional(),
});
export type ResolveCoderRequest = z.infer<typeof ResolveCoderRequestSchema>;

/** `PUT /backend/job/:jobId/coders/:coderId` -- full replace of the job-server-managed coder state. */
export const BackendCoderWriteSchema = z.object({
  variables: z.record(z.string(), VariableValueSchema),
  assignments: CoderAssignmentsSchema,
});
export type BackendCoderWrite = z.infer<typeof BackendCoderWriteSchema>;

// Annotations are stored per (unit, coder, variable). A row can be retired
// (`retiredAt`) instead of deleted, e.g. when a researcher resets units; only
// live rows count. The db server never decides whether a unit is "finished":
// the job server asks it to count live variables (docs/architecture.md §8).

/**
 * `GET /backend/job/:jobId/annotations?coderId=X` -- one coder's live
 * annotations, per unit (the job server's per-coder workspace).
 */
export const BackendAnnotationSchema = z.object({
  unitId: IdSchema,
  coderId: IdSchema,
  /** Live values only, by variable name, including ones from older codebook versions. */
  variables: z.record(z.string(), VariableValueSchema),
  /** First write of any live value for this unit: the unit's place in the coder's progress. */
  created: z.coerce.date(),
  /** Last write. */
  updated: z.coerce.date(),
});
export type BackendAnnotation = z.infer<typeof BackendAnnotationSchema>;

/**
 * `POST /backend/job/:jobId/finished` -- the job server's one bulk query
 * over annotations. Per group of variables: the rows where *all* `variables`
 * have a live value ("finished"), optionally with the values of `values`.
 * The db server only filters; the job server does the counting.
 *
 * - `level: "unit"` (default): per (unit, coder). A group is a unit loop's
 *   questions: which units coders finished, plus agreement values.
 * - `level: "coder"`: per coder, over coder-level values (survey questions,
 *   `auto` variables; `unitId: null`). E.g. which option of a `balanced`
 *   variable each coder has.
 */
export const FinishedRequestSchema = z.object({
  loops: z.array(
    z.object({
      /** Label echoed in the rows: the loop name for unit-level groups. */
      loop: z.string(),
      level: z.enum(["unit", "coder"]).optional(),
      variables: z.array(z.string()).min(1),
      values: z.array(z.string()).optional(),
    }),
  ),
  /** Only this coder's rows. */
  coderId: IdSchema.optional(),
});
export type FinishedRequest = z.infer<typeof FinishedRequestSchema>;

export const BackendFinishedSchema = z.object({
  loop: z.string(),
  /** `null` for coder-level groups. */
  unitId: IdSchema.nullable(),
  coderId: IdSchema,
  /** Earliest `created` of the group's live values. Orders a coder's progress. */
  created: z.coerce.date(),
  values: z.record(z.string(), VariableValueSchema).optional(),
});
export type BackendFinished = z.infer<typeof BackendFinishedSchema>;

/**
 * One unit's answers from one coder: upserts a live value per given
 * variable. Variables not given are left as they are. The job server only
 * writes complete units (every variable of the loop, `skip` for unasked
 * questions).
 */
export const BackendAnnotationWriteSchema = z.object({
  unitId: IdSchema,
  coderId: IdSchema,
  variables: z.record(z.string(), VariableValueSchema),
  /** The deployed codebook the coder answered under, so researchers can tell versions apart. */
  codebookId: IdSchema.optional(),
  /**
   * `hash` of the unit content the coder was shown. Normally the unit's
   * current hash; different if the unit changed after it was served (e.g.
   * from the job server's cache). The db server records it, never refuses
   * the write for it.
   */
  unitHash: z.string().min(1).optional(),
});
export type BackendAnnotationWrite = z.infer<typeof BackendAnnotationWriteSchema>;

/**
 * `POST /backend/job/:jobId/annotations` -- the job server's buffered
 * writes (its outbox, flushed about once a minute), applied **in order**:
 * a later write for the same unit and coder wins. Writes that can never
 * succeed (unknown unit or coder) are skipped and reported in `rejected`,
 * so one bad write doesn't block the rest; the call itself fails only if
 * nothing could be stored (e.g. the db server is down). Retrying a batch is
 * harmless: writes are upserts.
 */
export const BackendAnnotationBatchSchema = z.object({
  annotations: z.array(BackendAnnotationWriteSchema).min(1).max(1000),
});
export type BackendAnnotationBatch = z.infer<typeof BackendAnnotationBatchSchema>;

export const BackendAnnotationBatchResultSchema = z.object({
  /** Index into `annotations`, and why. */
  rejected: z.array(z.object({ index: z.number().int().nonnegative(), error: z.string() })),
});
export type BackendAnnotationBatchResult = z.infer<typeof BackendAnnotationBatchResultSchema>;

/**
 * `POST /backend/job/:jobId/token` -- how a job server gets a **job token**
 * (plan §13). No shared secret: `assertion` is a JWT signed by the job
 * server (EdDSA / Ed25519, "private_key_jwt" as in RFC 7523), with claims
 * `{ iss: <job server URL>, aud: <db server URL>, jobId, iat, exp, jti }`
 * (`exp - iat` at most 5 minutes). The db server:
 *
 * 1. checks that the job is deployed and **bound to `iss`** (it stores which
 *    job server each job runs on), that `aud` is its own URL, `jobId`
 *    matches the path and the time window is valid;
 * 2. verifies the signature with the key `kid` from `<iss>/.well-known/jwks.json`
 *    (fetched over TLS, cached by `kid`);
 * 3. returns a job token: a JWT it signs with its own secret (HS256), with
 *    claims `{ jobId, aud: <job server URL>, iat, exp, ck }`. `ck` is the
 *    **call key**, `base64url(HMAC-SHA256(secret, "calls|<job server
 *    URL>|<jobId>"))`: derived, so the db server can recompute it to sign
 *    its calls to the job server, and the job server reads it from the token.
 *
 * Any failure is `401 { error }`.
 */
export const JobTokenRequestSchema = z.object({ assertion: z.string().min(1) });
export type JobTokenRequest = z.infer<typeof JobTokenRequestSchema>;

export const JobTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.coerce.date(),
});
export type JobTokenResponse = z.infer<typeof JobTokenResponseSchema>;

export const backendEndpoints = {
  requestJobToken: {
    method: "POST",
    path: "/backend/job/:jobId/token",
    request: JobTokenRequestSchema,
    response: JobTokenResponseSchema,
  },
  getDeployment: {
    method: "GET",
    path: "/backend/job/:jobId/deployment",
    request: z.void(),
    response: DeploymentSpecSchema,
  },
  getUnits: {
    method: "GET",
    path: "/backend/job/:jobId/units",
    request: z.void(),
    response: z.array(BackendUnitSchema),
  },
  listCoders: {
    method: "GET",
    path: "/backend/job/:jobId/coders",
    request: z.void(),
    response: z.array(BackendCoderSchema),
  },
  resolveCoder: {
    method: "POST",
    path: "/backend/job/:jobId/coders/resolve",
    request: ResolveCoderRequestSchema,
    response: BackendCoderSchema,
  },
  putCoder: {
    method: "PUT",
    path: "/backend/job/:jobId/coders/:coderId",
    request: BackendCoderWriteSchema,
    response: z.void(),
  },
  listFinished: {
    method: "POST",
    path: "/backend/job/:jobId/finished",
    request: FinishedRequestSchema,
    response: z.array(BackendFinishedSchema),
  },
  listAnnotations: {
    method: "GET",
    path: "/backend/job/:jobId/annotations",
    request: z.void(),
    response: z.array(BackendAnnotationSchema),
  },
  putAnnotations: {
    method: "POST",
    path: "/backend/job/:jobId/annotations",
    request: BackendAnnotationBatchSchema,
    response: BackendAnnotationBatchResultSchema,
  },
} as const;

// ---------------------------------------------------------------------------
// Job server admin API: called by the db server (same shared secret).
// Deployment ids are `<backend name>.<jobId>`, where the backend name is how
// the job server's config refers to that db server.
// ---------------------------------------------------------------------------

/** Progress of one source (unitset) of one unit_loop. */
export const SourceStatusSchema = z.object({
  loop: z.string(),
  unitset: z.string(),
  mode: z.enum(["fixed", "dynamic"]),
  totalUnits: z.number().int().nonnegative(),
  /** Dynamic: units that met their saturation rule. Fixed: units every routed coder finished. */
  completeUnits: z.number().int().nonnegative(),
  /** Units with at least one coding. */
  startedUnits: z.number().int().nonnegative(),
  /** Dynamic: units currently reserved for a coder. */
  leasedUnits: z.number().int().nonnegative(),
  codings: z.number().int().nonnegative(),
  /** Coders routed to this source. */
  coders: z.number().int().nonnegative(),
});

export const DeploymentStatusSchema = z.object({
  deploymentId: z.string(),
  version: z.number().int().positive(),
  active: z.boolean(),
  coders: z.number().int().nonnegative(),
  sources: z.array(SourceStatusSchema),
  loadedAt: z.coerce.date(),
  /** Writes waiting to be sent to the db server (normally sent within a minute). */
  outbox: z
    .object({
      pending: z.number().int().nonnegative(),
      oldestAt: z.coerce.date().nullable(),
      /** Consecutive failed sends; > 0 means the db server isn't taking writes. */
      failures: z.number().int().nonnegative(),
      lastError: z.string().optional(),
    })
    .optional(),
  /** What the job server holds in memory for this deployment (sizes estimated from JSON). */
  memory: z
    .object({
      units: z.number().int().nonnegative(),
      unitBytes: z.number().int().nonnegative(),
      coders: z.number().int().nonnegative(),
      coderBytes: z.number().int().nonnegative(),
    })
    .optional(),
});
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

/**
 * Refresh request (researcher `POST /job/:jobId/deployment/refresh`, passed
 * on to the job server). The job server always re-checks the spec. Unit
 * content is cached and normally never re-fetched, since units shouldn't
 * change once coding started; `units` drops the cache for all (`"all"`) or
 * some units, so changed content is served from then on.
 */
export const RefreshDeploymentSchema = z.object({
  units: z.union([z.literal("all"), z.array(IdSchema)]).optional(),
});
export type RefreshDeployment = z.infer<typeof RefreshDeploymentSchema>;

/**
 * Researcher `POST /job/:jobId/deployment/preview`: a preview of the job's
 * latest codebook (deployed or not), run by the job server as deployment
 * `<backend>.<jobId>.preview`. Coders and answers stay in the job server's
 * memory; nothing is written to the db server. The client uses `token` like
 * an invite secret (`x-invite-secret`).
 *
 * Token format, so any db server can make one with the secret it shares with
 * the job server: `preview.<jobId>.<expiresAtMs>.<hex HMAC-SHA256(secret,
 * "preview.<jobId>.<expiresAtMs>")>`.
 */
export const PreviewSessionSchema = z.object({
  deploymentId: z.string(),
  token: z.string(),
  expiresAt: z.coerce.date(),
});
export type PreviewSession = z.infer<typeof PreviewSessionSchema>;

export const jobServerAdminEndpoints = {
  refreshDeployment: {
    method: "POST",
    path: "/admin/deployments/:deploymentId/refresh",
    /** Optional body. */
    request: RefreshDeploymentSchema,
    /** The deployment version the job server now runs. */
    response: z.object({ version: z.number().int().positive() }),
  },
  getDeploymentStatus: {
    method: "GET",
    path: "/admin/deployments/:deploymentId/status",
    request: z.void(),
    response: DeploymentStatusSchema,
  },
  dropDeployment: {
    method: "DELETE",
    path: "/admin/deployments/:deploymentId",
    request: z.void(),
    response: z.void(),
  },
} as const;
