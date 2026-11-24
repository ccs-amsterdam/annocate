import {
  UnitsSpecSchema,
  designErrors,
  designItems,
  EMPTY_SESSION,
  type DesignVersionMeta,
  type DesignVersion,
  type PublicInfo,
  type SessionSpec,
  type TopLevelItem,
  type UnitsSpec,
} from "@annotinder/contracts";
import type { designVersions } from "../db/schema/index.js";

/** A row of `design_versions`: a version of the design. */
export type DesignVersionRow = typeof designVersions.$inferSelect;

/** A stored design version's items, without the session. */
function storedItems(row: Pick<DesignVersionRow, "items">): TopLevelItem[] {
  return (Array.isArray(row.items) ? row.items : []) as TopLevelItem[];
}

/** A stored design version's session (docs/architecture.md §6): always there. */
function designVersionSession(row: Pick<DesignVersionRow, "session">): SessionSpec {
  return (row.session as SessionSpec | null) ?? EMPTY_SESSION;
}

/** A stored design version's public info (what coders see about the study), if any. */
function designVersionPublic(row: Partial<Pick<DesignVersionRow, "public">>): PublicInfo | null {
  return (row.public as PublicInfo | null | undefined) ?? null;
}

/** A stored design version's items with the Study entry (session, public info) first: what validation, links and the runtime work on. */
export function designVersionItems(
  row: Pick<DesignVersionRow, "items" | "session"> & Partial<Pick<DesignVersionRow, "public">>,
): TopLevelItem[] {
  return designItems({
    items: storedItems(row),
    session: designVersionSession(row),
    public: designVersionPublic(row),
  }) as TopLevelItem[];
}

/** A stored design version's unit fields (docs/architecture.md §8.4). */
export function designVersionUnits(row: Pick<DesignVersionRow, "units">): UnitsSpec {
  const parsed = UnitsSpecSchema.safeParse(row.units);
  return parsed.success ? parsed.data : { fields: [] };
}

/** Whether a design's items (with the Study entry) pass validation and ask something, as required to deploy or preview them. */
export function itemsValid(items: unknown[]): boolean {
  return items.some((i) => (i as { type?: unknown } | null)?.type !== "session") && designErrors(items).length === 0;
}

/**
 * Whether stored versions are valid, as found before: validating a design
 * takes milliseconds, and a study's list of versions asks for each of them
 * on every request. A version's items change only with its revision; the
 * time of the change is in the key too, since ids start again in an emptied
 * database (tests).
 */
const knownValid = new Map<string, boolean>();
const MAX_KNOWN_VALID = 5000;

/** Whether a stored design version passes validation (see `itemsValid`). */
function versionValid(row: DesignVersionRow): boolean {
  const key = `${row.id}/${row.revision}/${row.updated.getTime()}`;
  const known = knownValid.get(key);
  if (known !== undefined) return known;
  const valid = itemsValid(designVersionItems(row));
  if (knownValid.size >= MAX_KNOWN_VALID) knownValid.delete(knownValid.keys().next().value!);
  knownValid.set(key, valid);
  return valid;
}

export function toDesignVersionMeta(row: DesignVersionRow): DesignVersionMeta {
  return {
    id: row.id,
    note: row.note,
    created: row.created,
    updated: row.updated,
    updatedBy: row.updatedBy,
    revision: row.revision,
    immutable: row.immutable,
    valid: versionValid(row),
  };
}

/** A stored design version as served. */
export function toDesignVersion(row: DesignVersionRow): DesignVersion {
  return {
    ...toDesignVersionMeta(row),
    studyId: row.studyId,
    formatVersion: row.formatVersion,
    items: storedItems(row),
    units: designVersionUnits(row),
    session: designVersionSession(row),
    public: designVersionPublic(row),
  };
}
