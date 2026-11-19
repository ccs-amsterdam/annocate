import { z } from "zod";
import { UnitsSpecSchema } from "./unitFields.js";
import { DesignItemsSchema } from "./design/designVersion.js";
import { EMPTY_SESSION, PublicInfoSchema, SessionSpecSchema } from "./design/session.js";
import { RecipeSchema } from "./recipe.js";

/**
 * The release of AnnoTinder (server, client and contracts are released
 * together). Bumped for each release, with the packages' versions
 * (docs/release-checklist.md); a test checks they agree.
 */
export const RELEASE = "0.1.0";

/**
 * The client a study ran on (docs/plans/design-viewer.md §1): the release,
 * for people, and the commit, to be exact ("unknown" when the build didn't
 * say). Recorded per deployment.
 */
export const ClientVersionSchema = z.object({ release: z.string().min(1).max(64), commit: z.string().min(1).max(64) });
export type ClientVersion = z.infer<typeof ClientVersionSchema>;

/**
 * The design file's format (`formatVersion`): bumped on a breaking change to
 * the design schema, so a viewer knows whether it can read a file. Older
 * files open in the viewer of the release they name.
 */
export const DESIGN_FORMAT_VERSION = 1;

/**
 * A design file (`design.json`, docs/plans/design-viewer.md §1): a whole
 * design version (public info, session, unit fields, items), with the format and the
 * client it ran on (a deployment's) or was exported from.
 */
export const DesignFileSchema = z.object({
  format: z.literal("annotinder-design"),
  formatVersion: z.number().int().positive(),
  client: ClientVersionSchema,
  exportedAt: z.coerce.date(),
  /** The study's name, and the version as people see it (v1, v2, ...; null: not numbered, e.g. a new draft). */
  name: z.string(),
  version: z.number().int().positive().nullable(),
  note: z.string().nullable(),
  design: z.object({
    public: PublicInfoSchema.nullable(),
    session: SessionSpecSchema,
    units: UnitsSpecSchema,
    items: DesignItemsSchema,
  }),
});
export type DesignFile = z.infer<typeof DesignFileSchema>;

/** A design file for a design version (its public info, session, unit fields and items). */
export function designFile(
  design: { items: unknown[]; session: unknown; public: unknown; units: { fields: unknown[] }; note?: string | null },
  meta: { name: string; version: number | null; client: ClientVersion; exportedAt?: Date },
): DesignFile {
  return {
    format: "annotinder-design",
    formatVersion: DESIGN_FORMAT_VERSION,
    client: meta.client,
    exportedAt: meta.exportedAt ?? new Date(),
    name: meta.name,
    version: meta.version,
    note: design.note ?? null,
    design: {
      public: design.public ?? null,
      session: design.session ?? EMPTY_SESSION,
      units: design.units,
      items: design.items,
    } as DesignFile["design"],
  };
}

/** The study file's format (`formatVersion`): bumped on a breaking change, as the design file's. */
export const STUDY_FORMAT_VERSION = 1;

/**
 * A study file (`study.json` in the results download): the study as it is,
 * to make a copy of it, here or on another server ("New study from a
 * file"). It is a recipe (`POST /study/from-recipe`): the name, the units
 * with their current data, the set columns, the latest design version
 * (with its unit fields) as a draft, and the study's settings. Coders,
 * answers and links are not part of it: the copy starts without coders.
 */
export const StudyFileSchema = z.object({
  format: z.literal("annotinder-study"),
  formatVersion: z.number().int().positive(),
  client: ClientVersionSchema,
  exportedAt: z.coerce.date(),
  recipe: RecipeSchema,
});
export type StudyFile = z.infer<typeof StudyFileSchema>;
export type StudyFileInput = z.input<typeof StudyFileSchema>;
