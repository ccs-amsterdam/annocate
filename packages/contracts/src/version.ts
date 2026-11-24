import { z } from "zod";
import { DESIGN_FORMAT_VERSION } from "./design/format.js";
import { UnitsSpecSchema } from "./unitFields.js";
import { DesignItemsSchema } from "./design/designVersion.js";
import { EMPTY_SESSION, PublicInfoSchema, SessionSpecSchema } from "./design/session.js";

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

/** The results export's format (its manifest's `formatVersion`): bumped when its files or their rows change. */
export const RESULTS_EXPORT_FORMAT_VERSION = 1;

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

/**
 * A study export (`<study>_<date>.annotinder.gz`, docs/hosting.md "Moving a
 * study"): the whole study, coders and answers included, to restore or move
 * it to another server. Gzipped JSON lines: this manifest, then one line per
 * row (`{ "table": "units", "row": {...} }`), each row as the database holds
 * it. Rows are as of the database's migration (`migration`): an importing
 * server applies its newer migrations to them first, so an export opens on
 * any later release. Not meant to be read or edited by hand; the results
 * download is for analysis.
 */
export const STUDY_EXPORT_FORMAT_VERSION = 1;

export const StudyExportManifestSchema = z.object({
  format: z.literal("annotinder-study-export"),
  formatVersion: z.number().int().positive(),
  client: ClientVersionSchema,
  exportedAt: z.coerce.date(),
  /** The database's last migration when exported: its position and name (`migrations/meta/_journal.json`). */
  migration: z.object({ idx: z.number().int().nonnegative(), tag: z.string() }),
  study: z.object({ name: z.string() }),
  /** The tables in the file, in the order their rows come (parents first), with their number of rows. */
  tables: z.array(z.object({ name: z.string(), rows: z.number().int().nonnegative() })),
});
export type StudyExportManifest = z.infer<typeof StudyExportManifestSchema>;
