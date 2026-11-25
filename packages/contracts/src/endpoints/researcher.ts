import { z } from "zod";
import {
  StudyWriteSchema,
  StudyResponseSchema,
  StudyUsersWriteSchema,
  StudyUserResponseSchema,
  ExampleSummarySchema,
  StudyFromExampleSchema,
} from "../study.js";
import { RecipeSchema } from "../recipe.js";
import { listResponse } from "../paging.js";
import { DesignWriteSchema, DesignVersionSchema, DesignVersionMetaSchema } from "../design/designVersion.js";
import { UnitsCreateBodySchema, UnitMetaSchema, UnitPageSchema, UnitResponseSchema } from "../unit.js";
import { UnitFieldSchema, UnitsSpecSchema } from "../unitFields.js";
import { SetGroupResponseSchema, SetGroupWriteSchema } from "../sets.js";
import {
  CoderProgressSchema,
  LinkResponseSchema,
  CoderDeletionSchema,
  DeleteCodersSchema,
  DeleteCodersResponseSchema,
  CoderUnitsSchema,
} from "../coder.js";
import { StudyOverviewSchema } from "../overview.js";
import {
  ResultsAgreementSchema,
  ResultsAnswersSchema,
  ResultsCodersSchema,
  ResultsExportSchema,
  ResultsUnitSchema,
  ResultsUnitsSchema,
} from "../results.js";
import {
  AccountDeletionSchema,
  ApiKeyCreatedSchema,
  ApiKeyResponseSchema,
  ApiKeyWriteSchema,
  AuthOptionsSchema,
  ConfirmDeletionSchema,
  MeResponseSchema,
  ResearcherRequestWriteSchema,
} from "../account.js";
import {
  AnnotationPageSchema,
  AnnotationsQuerySchema,
  DeviceSchema,
  UnitVersionPageSchema,
  UnitVersionsQuerySchema,
} from "../annotations.js";
import {
  DeploymentWriteSchema,
  DeploymentResponseSchema,
  DeploymentStatusSchema,
  DeploymentVersionSchema,
  PendingChangesSchema,
  ResetAnnotationsSchema,
  PreviewSessionSchema,
} from "../deployment.js";

/**
 * The researcher API (docs/api/researcher.md): called by the client's
 * researcher UI (`ResearcherApi`), and by scripts (R, Python) and other
 * systems. Studies, design versions, units, their columns with a role, links, coder progress,
 * deployment.
 *
 * Path params are written as `:param`. A server hosts any number of studies;
 * per-study resources are routed under `/study/:studyId/...`.
 *
 * Authentication (account.ts): a session cookie from logging in (with the
 * `x-annotinder: 1` header, against CSRF), or `authorization: Bearer <API
 * key>`. What a user may do in a study is their role there (study users).
 * Logging in itself is a browser redirect, not a JSON endpoint:
 * `GET /auth/login?returnTo=<path>`.
 */
export const researcherEndpoints = {
  getAuthOptions: { method: "GET", path: "/auth/options", request: z.void(), response: AuthOptionsSchema },
  logout: { method: "POST", path: "/auth/logout", request: z.void(), response: z.void() },
  getMe: { method: "GET", path: "/me", request: z.void(), response: MeResponseSchema },
  /** What deleting the user's account would delete, and what keeps it from being deleted. */
  getAccountDeletion: { method: "GET", path: "/me/deletion", request: z.void(), response: AccountDeletionSchema },
  /**
   * Deletes the user's account, with the studies only they have a role in
   * (`getAccountDeletion`): their logins, roles, API keys and security log
   * go. Sensitive, as createApiKey; `confirm` is their email address. 409
   * `account_has_studies` or `last_admin` while something keeps it.
   */
  deleteAccount: { method: "DELETE", path: "/me", request: ConfirmDeletionSchema, response: z.void() },
  /** Ask an admin to become a researcher (when the server takes requests). */
  requestResearcher: {
    method: "POST",
    path: "/me/researcher-request",
    request: ResearcherRequestWriteSchema,
    response: MeResponseSchema,
  },
  listApiKeys: { method: "GET", path: "/me/keys", request: z.void(), response: z.array(ApiKeyResponseSchema) },
  /** Sensitive (like deleting answers or admin roles): a web session with a recent second factor (step-up, 403 `step_up_required`), never an API key (403 `not_with_api_key`). */
  createApiKey: { method: "POST", path: "/me/keys", request: ApiKeyWriteSchema, response: ApiKeyCreatedSchema },
  /** Sensitive, as createApiKey. */
  revokeApiKey: { method: "POST", path: "/me/keys/:id/revoke", request: z.void(), response: ApiKeyResponseSchema },

  /** Query: `after`, `limit` (paging.ts). */
  listStudies: {
    method: "GET",
    path: "/study",
    request: z.void(),
    response: listResponse("studies", StudyResponseSchema),
  },
  createStudy: { method: "POST", path: "/study", request: StudyWriteSchema, response: StudyResponseSchema },
  listExamples: { method: "GET", path: "/examples", request: z.void(), response: z.array(ExampleSummarySchema) },
  /** A new study from an example: units, a deployed design, a link and example answers. */
  createStudyFromExample: {
    method: "POST",
    path: "/study/from-example",
    request: StudyFromExampleSchema,
    response: StudyResponseSchema,
  },
  /** A new study from a recipe (a design file, contracts `recipe.ts`): units, their columns with a role, a design (a draft unless `publish`; deploying makes its links). */
  createStudyFromRecipe: {
    method: "POST",
    path: "/study/from-recipe",
    request: RecipeSchema,
    response: StudyResponseSchema,
  },
  /**
   * A study export: the whole study (coders and answers included) as a gzipped
   * file (`StudyExportManifestSchema`). Study ADMIN, and sensitive (a recent
   * login with a second factor; never an API key): it holds coders' data.
   */
  exportStudy: { method: "GET", path: "/study/:id/export", request: z.void(), response: z.void() },
  /**
   * A new study from a study export (the request body: the file's bytes).
   * Query: `name` (else the exported one), `coders=false` (without coders
   * and their answers). Its migrations are applied first; ids are new, the
   * importer owns it. 201 with the study.
   */
  importStudy: { method: "POST", path: "/study/import", request: z.void(), response: StudyResponseSchema },
  getStudy: { method: "GET", path: "/study/:id", request: z.void(), response: StudyResponseSchema },
  updateStudy: { method: "PUT", path: "/study/:id", request: StudyWriteSchema, response: StudyResponseSchema },
  /**
   * Deletes the study with all its data. Sensitive, as createApiKey; `confirm`
   * is the study's name, typed out (400 `confirmation_mismatch` otherwise).
   */
  deleteStudy: { method: "DELETE", path: "/study/:id", request: ConfirmDeletionSchema, response: z.void() },
  getStudyUsers: {
    method: "GET",
    path: "/study/:id/users",
    request: z.void(),
    response: z.array(StudyUserResponseSchema),
  },
  putStudyUsers: { method: "PUT", path: "/study/:id/users", request: StudyUsersWriteSchema, response: z.void() },

  listDesignVersions: {
    method: "GET",
    path: "/study/:studyId/design",
    request: z.void(),
    response: listResponse("versions", DesignVersionMetaSchema),
  },
  getDesignVersion: {
    method: "GET",
    path: "/study/:studyId/design/:id",
    request: z.void(),
    response: DesignVersionSchema,
  },
  createDesignVersion: {
    method: "POST",
    path: "/study/:studyId/design",
    request: DesignWriteSchema,
    response: DesignVersionSchema,
  },
  updateDesignVersion: {
    method: "PUT",
    path: "/study/:studyId/design/:id",
    request: DesignWriteSchema,
    response: DesignVersionSchema,
  },
  deleteDesignVersion: { method: "DELETE", path: "/study/:studyId/design/:id", request: z.void(), response: z.void() },

  listUnits: {
    method: "GET",
    path: "/study/:studyId/units",
    request: z.void(),
    response: listResponse("units", UnitMetaSchema),
  },
  /** Static paths: a server must match these before `/units/:id`. */
  getUnitFields: {
    method: "GET",
    path: "/study/:studyId/units/fields",
    request: z.void(),
    response: z.array(UnitFieldSchema),
  },
  /**
   * Replaces the draft design's unit fields (docs/architecture.md §8.4):
   * declare, retype (the units' values must fit), describe, or remove
   * fields the design doesn't use (their values leave the draft units).
   */
  putUnitFields: {
    method: "PUT",
    path: "/study/:studyId/units/fields",
    request: UnitsSpecSchema,
    response: z.array(UnitFieldSchema),
  },
  /** Query: `offset`, `limit` (max 200), and `column` (a column with a role) with `set` (that set's units, in its order). */
  listUnitPage: { method: "GET", path: "/study/:studyId/units/page", request: z.void(), response: UnitPageSchema },
  getUnit: { method: "GET", path: "/study/:studyId/units/:id", request: z.void(), response: UnitResponseSchema },
  createUnits: {
    method: "POST",
    path: "/study/:studyId/units",
    request: UnitsCreateBodySchema,
    response: z.array(UnitResponseSchema),
  },
  deleteUnit: { method: "DELETE", path: "/study/:studyId/units/:id", request: z.void(), response: z.void() },

  /** The draft's columns with a role (`coder_set`, `condition_set`, `part_set`, `test_set`), each with its sets in order; `?live=true`: the deployed ones. */
  listSetGroups: {
    method: "GET",
    path: "/study/:studyId/sets",
    request: z.void(),
    response: z.array(SetGroupResponseSchema),
  },
  /**
   * Makes or replaces a column with a role (`:group`: its name), its sets; it becomes a unit field of its type.
   * `test_set` takes only `overlap`, `practice` and `gold`, one per unit. Deployed, links follow (a link per coder
   * of `coder_set`).
   */
  putSetGroup: {
    method: "PUT",
    path: "/study/:studyId/sets/:group",
    request: SetGroupWriteSchema,
    response: SetGroupResponseSchema,
  },
  deleteSetGroup: { method: "DELETE", path: "/study/:studyId/sets/:group", request: z.void(), response: z.void() },

  listCoders: {
    method: "GET",
    path: "/study/:studyId/coders",
    request: z.void(),
    response: listResponse("coders", CoderProgressSchema),
  },
  /** Per coder id: the units they answered, and the ones they were sent but didn't answer (coders.ts). */
  listCoderUnits: {
    method: "GET",
    path: "/study/:studyId/coders/units",
    request: z.void(),
    response: CoderUnitsSchema,
  },
  /** Deletes coders and all their answers for good (e.g. a coder withdrew), by session id, coder id or email (ADMIN). */
  deleteCoders: {
    method: "POST",
    path: "/study/:studyId/coders/delete",
    request: DeleteCodersSchema,
    response: DeleteCodersResponseSchema,
  },
  /** Deletes later: the coder's request to delete their answers stays, but is no longer brought up (ADMIN). */
  postponeDeletion: {
    method: "POST",
    path: "/study/:studyId/coders/:id/deletion-request/postpone",
    request: z.void(),
    response: z.void(),
  },
  /** The study's deletion log: coders whose data was deleted, newest first. */
  listCoderDeletions: {
    method: "GET",
    path: "/study/:studyId/coders/deletions",
    request: z.void(),
    response: z.array(CoderDeletionSchema),
  },
  listLinks: {
    method: "GET",
    path: "/study/:studyId/links",
    request: z.void(),
    response: listResponse("links", LinkResponseSchema),
  },
  /** No new coders from this link (coders who started keep working); a redeploy keeps it revoked. Undone by `reopenLink`. */
  revokeLink: {
    method: "POST",
    path: "/study/:studyId/links/:id/revoke",
    request: z.void(),
    response: LinkResponseSchema,
  },
  /** A revoked link takes new coders again. */
  reopenLink: {
    method: "POST",
    path: "/study/:studyId/links/:id/reopen",
    request: z.void(),
    response: LinkResponseSchema,
  },
  /** A new secret for a link (the old link stops working; coders who started keep their sessions). */
  renewLinkSecret: {
    method: "POST",
    path: "/study/:studyId/links/:id/secret",
    request: z.void(),
    response: LinkResponseSchema,
  },
  getOverview: { method: "GET", path: "/study/:studyId/overview", request: z.void(), response: StudyOverviewSchema },

  // Deploying a study: which design version coders get (docs/architecture.md).
  getDeployment: {
    method: "GET",
    path: "/study/:studyId/deployment",
    request: z.void(),
    response: DeploymentResponseSchema.nullable(),
  },
  putDeployment: {
    method: "PUT",
    path: "/study/:studyId/deployment",
    request: DeploymentWriteSchema,
    response: DeploymentResponseSchema,
  },
  /** What deploying the drafts would change (docs/architecture.md §8.4). */
  getPendingChanges: {
    method: "GET",
    path: "/study/:studyId/deployment/pending",
    request: z.void(),
    response: PendingChangesSchema,
  },
  /** The deployed versions, newest first. */
  listDeploymentVersions: {
    method: "GET",
    path: "/study/:studyId/deployment/versions",
    request: z.void(),
    response: z.array(DeploymentVersionSchema),
  },
  getDeploymentStatus: {
    method: "GET",
    path: "/study/:studyId/deployment/status",
    request: z.void(),
    response: DeploymentStatusSchema,
  },
  createPreview: {
    method: "POST",
    path: "/study/:studyId/deployment/preview",
    request: z.void(),
    response: PreviewSessionSchema,
  },
  /** Annotations, a page at a time (annotations.ts). */
  listAnnotations: {
    method: "GET",
    path: "/study/:studyId/annotations",
    query: AnnotationsQuerySchema,
    request: z.void(),
    response: AnnotationPageSchema,
  },
  /** Units as coders saw them, a page at a time (oldest first). */
  listUnitVersions: {
    method: "GET",
    path: "/study/:studyId/unit-versions",
    query: UnitVersionsQuerySchema,
    request: z.void(),
    response: UnitVersionPageSchema,
  },
  /** How coders answered each question so far (results.ts). */
  getResultsAnswers: {
    method: "GET",
    path: "/study/:studyId/results/answers",
    request: z.void(),
    response: ResultsAnswersSchema,
  },
  /** Agreement per unit-loop question so far (results.ts). */
  getResultsAgreement: {
    method: "GET",
    path: "/study/:studyId/results/agreement",
    request: z.void(),
    response: ResultsAgreementSchema,
  },
  /** Units two or more coders answered, most disagreement first (results.ts). */
  listResultUnits: {
    method: "GET",
    path: "/study/:studyId/results/units",
    request: z.void(),
    response: ResultsUnitsSchema,
  },
  /** One unit as its coders saw it, with their answers (results.ts). */
  getResultUnit: {
    method: "GET",
    path: "/study/:studyId/results/units/:unitId",
    request: z.void(),
    response: ResultsUnitSchema,
  },
  /** A link to the study's raw export, written now or reused if nothing changed (results.ts). */
  exportResults: {
    method: "POST",
    path: "/study/:studyId/results/export",
    request: z.void(),
    response: ResultsExportSchema,
  },
  /** Per coder session: units, time per unit, practice tries (results.ts). */
  listResultCoders: {
    method: "GET",
    path: "/study/:studyId/results/coders",
    request: z.void(),
    response: ResultsCodersSchema,
  },
  /** The devices coders used, for the export (`deviceId` on annotations). */
  listDevices: {
    method: "GET",
    path: "/study/:studyId/devices",
    request: z.void(),
    response: listResponse("devices", DeviceSchema),
  },
  resetAnnotations: {
    method: "POST",
    path: "/study/:studyId/annotations/reset",
    request: ResetAnnotationsSchema,
    response: z.object({ retired: z.number().int().nonnegative() }),
  },
} as const;

export type ResearcherEndpointName = keyof typeof researcherEndpoints;
