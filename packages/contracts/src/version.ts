import { z } from "zod";
import { UnitsSpecSchema } from "./unitFields.js";
import { DesignItemsSchema } from "./design/designVersion.js";
import { SessionSpecSchema } from "./design/session.js";

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
 * design version (items, session, unit fields), with the format and the
 * client it ran on (a deployment's) or was exported from.
 */
export const DesignFileSchema = z.object({
  format: z.literal("annotinder-design"),
  formatVersion: z.number().int().positive(),
  client: ClientVersionSchema,
  exportedAt: z.coerce.date(),
  /** The job's name, and the version as people see it (v1, v2, ...; null: not numbered, e.g. a new draft). */
  name: z.string(),
  version: z.number().int().positive().nullable(),
  note: z.string().nullable(),
  design: z.object({
    items: DesignItemsSchema,
    session: SessionSpecSchema.nullable(),
    units: UnitsSpecSchema,
  }),
});
export type DesignFile = z.infer<typeof DesignFileSchema>;

/** A design file for a design version (its items, session and unit fields). */
export function designFile(
  design: { items: unknown[]; session: unknown; units: { fields: unknown[] }; note?: string | null },
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
    design: { items: design.items, session: design.session ?? null, units: design.units } as DesignFile["design"],
  };
}
