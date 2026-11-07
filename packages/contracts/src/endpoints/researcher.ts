import { z } from "zod";
import { StudyWriteSchema, StudyResponseSchema, StudyUsersWriteSchema, StudyUserSchema, ExampleSummarySchema, StudyFromExampleSchema } from "../study.js";
import { RecipeSchema } from "../recipe.js";
import { DesignWriteSchema, DesignVersionSchema, DesignVersionMetaSchema } from "../design/designVersion.js";
import { UnitsCreateBodySchema, UnitMetaSchema, UnitPageSchema, UnitResponseSchema } from "../unit.js";
import { UnitFieldSchema, UnitsSpecSchema } from "../unitFields.js";
import { SetGroupResponseSchema, SetGroupWriteSchema } from "../sets.js";
import { CoderProgressSchema, LinkWriteSchema, LinkResponseSchema, CoderDeletionSchema, DeleteCodersSchema, DeleteCodersResponseSchema } from "../coder.js";
import { StudyOverviewSchema } from "../overview.js";
import {
  ApiKeyCreatedSchema,
  ApiKeyResponseSchema,
  ApiKeyWriteSchema,
  AuthOptionsSchema,
  MeResponseSchema,
  PasskeyRegisterSchema,
  PasskeySchema,
  RedeemResearcherInviteSchema,
  ResearcherRequestWriteSchema,
} from "../account.js";
import { AnnotationPageSchema, AnnotationsQuerySchema, DeviceSchema, UnitVersionPageSchema, UnitVersionsQuerySchema } from "../annotations.js";
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
 * systems. Studies, design versions, units, set groups, links, coder progress,
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
  /** Ask an admin to become a researcher (when the server takes requests). */
  requestResearcher: { method: "POST", path: "/me/researcher-request", request: ResearcherRequestWriteSchema, response: MeResponseSchema },
  /** Become a researcher with an invite link's secret. */
  redeemResearcherInvite: { method: "POST", path: "/me/researcher-invite", request: RedeemResearcherInviteSchema, response: MeResponseSchema },
  // Passkeys, the second factor when ANNOTINDER_2FA=annotinder (docs/security.md). The WebAuthn
  // options and responses are @simplewebauthn's JSON (browser: startRegistration / startAuthentication).
  /** Options to add a passkey (the first one right after login; later ones only with a confirmed passkey). */
  passkeyRegisterOptions: { method: "POST", path: "/auth/passkey/register/options", request: z.void(), response: z.unknown() },
  /** Adds the passkey; it also confirms this login. The first one returns recovery codes, shown once. */
  passkeyRegister: {
    method: "POST",
    path: "/auth/passkey/register",
    request: PasskeyRegisterSchema,
    response: z.object({ recoveryCodes: z.array(z.string()).nullable() }),
  },
  /** Options to confirm this login with a passkey. */
  passkeyLoginOptions: { method: "POST", path: "/auth/passkey/login/options", request: z.void(), response: z.unknown() },
  passkeyLogin: { method: "POST", path: "/auth/passkey/login", request: z.object({ response: z.unknown() }), response: z.void() },
  /** Confirms this login with a recovery code (used up), e.g. to add a new passkey after losing one. */
  passkeyRecover: { method: "POST", path: "/auth/passkey/recover", request: z.object({ code: z.string().min(1).max(64) }), response: z.void() },
  listPasskeys: { method: "GET", path: "/me/passkeys", request: z.void(), response: z.array(PasskeySchema) },
  /** Removes a passkey (not the last one). */
  deletePasskey: { method: "DELETE", path: "/me/passkeys/:id", request: z.void(), response: z.void() },
  /** New recovery codes (the old ones stop working), shown once. */
  renewRecoveryCodes: { method: "POST", path: "/me/recovery-codes", request: z.void(), response: z.object({ recoveryCodes: z.array(z.string()) }) },
  listApiKeys: { method: "GET", path: "/me/keys", request: z.void(), response: z.array(ApiKeyResponseSchema) },
  createApiKey: { method: "POST", path: "/me/keys", request: ApiKeyWriteSchema, response: ApiKeyCreatedSchema },
  revokeApiKey: { method: "POST", path: "/me/keys/:id/revoke", request: z.void(), response: ApiKeyResponseSchema },

  listStudies: { method: "GET", path: "/study", request: z.void(), response: z.array(StudyResponseSchema) },
  createStudy: { method: "POST", path: "/study", request: StudyWriteSchema, response: StudyResponseSchema },
  listExamples: { method: "GET", path: "/examples", request: z.void(), response: z.array(ExampleSummarySchema) },
  /** A new study from an example: units, codebook (deployed), link and example answers. */
  createStudyFromExample: { method: "POST", path: "/study/from-example", request: StudyFromExampleSchema, response: StudyResponseSchema },
  /** A new study from a recipe (the setup wizard): units, set groups, a codebook (a draft unless `publish`; deploying makes its links). */
  createStudyFromRecipe: { method: "POST", path: "/study/from-recipe", request: RecipeSchema, response: StudyResponseSchema },
  getStudy: { method: "GET", path: "/study/:id", request: z.void(), response: StudyResponseSchema },
  updateStudy: { method: "PUT", path: "/study/:id", request: StudyWriteSchema, response: StudyResponseSchema },
  deleteStudy: { method: "DELETE", path: "/study/:id", request: z.void(), response: z.void() },
  getStudyUsers: { method: "GET", path: "/study/:id/users", request: z.void(), response: z.array(StudyUserSchema) },
  putStudyUsers: { method: "PUT", path: "/study/:id/users", request: StudyUsersWriteSchema, response: z.void() },

  listDesignVersions: {
    method: "GET",
    path: "/study/:studyId/design",
    request: z.void(),
    response: z.array(DesignVersionMetaSchema),
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

  listUnits: { method: "GET", path: "/study/:studyId/units", request: z.void(), response: z.array(UnitMetaSchema) },
  /** Static paths: a server must match these before `/units/:id`. */
  getUnitFields: {
    method: "GET",
    path: "/study/:studyId/units/fields",
    request: z.void(),
    response: z.array(UnitFieldSchema),
  },
  /**
   * Replaces the draft design's unit fields (docs/plans/design.md §3):
   * declare, retype (the units' values must fit), describe, or remove
   * fields the codebook doesn't use (their values leave the draft units).
   */
  putUnitFields: {
    method: "PUT",
    path: "/study/:studyId/units/fields",
    request: UnitsSpecSchema,
    response: z.array(UnitFieldSchema),
  },
  /** Query: `offset`, `limit` (max 200), and `group` with `set` (that set's units, in its order). */
  listUnitPage: { method: "GET", path: "/study/:studyId/units/page", request: z.void(), response: UnitPageSchema },
  getUnit: { method: "GET", path: "/study/:studyId/units/:id", request: z.void(), response: UnitResponseSchema },
  createUnits: {
    method: "POST",
    path: "/study/:studyId/units",
    request: UnitsCreateBodySchema,
    response: z.array(UnitResponseSchema),
  },
  deleteUnit: { method: "DELETE", path: "/study/:studyId/units/:id", request: z.void(), response: z.void() },

  /** The set groups (docs/plans/sets-and-session-parameters.md §1), each with its sets in order. */
  /** The draft's set groups; `?live=true`: the deployed ones. */
  listSetGroups: { method: "GET", path: "/study/:studyId/sets", request: z.void(), response: z.array(SetGroupResponseSchema) },
  /** Makes or replaces a group (its sets). Republished links follow (link parameters with the group's sets). */
  putSetGroup: { method: "PUT", path: "/study/:studyId/sets/:group", request: SetGroupWriteSchema, response: SetGroupResponseSchema },
  deleteSetGroup: { method: "DELETE", path: "/study/:studyId/sets/:group", request: z.void(), response: z.void() },

  listCoders: { method: "GET", path: "/study/:studyId/coders", request: z.void(), response: z.array(CoderProgressSchema) },
  /** Deletes coders and all their answers for good (e.g. a participant withdrew), by id, participant id or email (ADMIN). */
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
    response: z.array(LinkResponseSchema),
  },
  /** A link's access settings (label, login, emails, max uses, participant id). Links themselves come from the deployed codebook. */
  updateLink: {
    method: "PUT",
    path: "/study/:studyId/links/:id",
    request: LinkWriteSchema,
    response: LinkResponseSchema,
  },
  revokeLink: {
    method: "POST",
    path: "/study/:studyId/links/:id/revoke",
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

  // Deploying a study: which codebook coders get (docs/architecture.md).
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
  /** What deploying the drafts would change (docs/plans/design.md §5). */
  getPendingChanges: { method: "GET", path: "/study/:studyId/deployment/pending", request: z.void(), response: PendingChangesSchema },
  /** The deployed versions, newest first. */
  listDeploymentVersions: { method: "GET", path: "/study/:studyId/deployment/versions", request: z.void(), response: z.array(DeploymentVersionSchema) },
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
  /** The devices coders used, for the export (`deviceId` on annotations). */
  listDevices: { method: "GET", path: "/study/:studyId/devices", request: z.void(), response: z.array(DeviceSchema) },
  resetAnnotations: {
    method: "POST",
    path: "/study/:studyId/annotations/reset",
    request: ResetAnnotationsSchema,
    response: z.object({ retired: z.number().int().nonnegative() }),
  },
} as const;

export type ResearcherEndpointName = keyof typeof researcherEndpoints;
