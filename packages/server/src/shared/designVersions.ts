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

/** A row of `design_versions`: a version of the design. */
export interface DesignVersionRow {
  id: number;
  study_id: number;
  note: string | null;
  items: unknown;
  units: unknown;
  session: unknown;
  public: unknown;
  created: Date;
  updated: Date;
  updated_by: string | null;
  revision: number;
  immutable: boolean;
}

/** A stored codebook's items, without the session. */
function storedItems(row: Pick<DesignVersionRow, "items">): TopLevelItem[] {
  return (Array.isArray(row.items) ? row.items : []) as TopLevelItem[];
}

/** A stored design version's session (docs/plans/design.md §2): always there. */
export function designVersionSession(row: Pick<DesignVersionRow, "session">): SessionSpec {
  return (row.session as SessionSpec | null) ?? EMPTY_SESSION;
}

/** A stored design version's public info (what coders see about the study), if any. */
export function designVersionPublic(row: Partial<Pick<DesignVersionRow, "public">>): PublicInfo | null {
  return (row.public as PublicInfo | null | undefined) ?? null;
}

/** A stored design version's items with the Study entry (session, public info) first: what validation, links and the runtime work on. */
export function designVersionItems(row: Pick<DesignVersionRow, "items" | "session"> & Partial<Pick<DesignVersionRow, "public">>): TopLevelItem[] {
  return designItems({ items: storedItems(row), session: designVersionSession(row), public: designVersionPublic(row) }) as TopLevelItem[];
}

/** A stored codebook's unit fields (docs/plans/design.md §3). */
export function designVersionUnits(row: Pick<DesignVersionRow, "units">): UnitsSpec {
  const parsed = UnitsSpecSchema.safeParse(row.units);
  return parsed.success ? parsed.data : { fields: [] };
}

/** Whether a design's items (with the Study entry) pass validation and ask something, as required to deploy or preview them. */
export function itemsValid(items: unknown[]): boolean {
  return items.some((i) => (i as { type?: unknown } | null)?.type !== "session") && designErrors(items).length === 0;
}

export function toDesignVersionMeta(row: DesignVersionRow): DesignVersionMeta {
  return {
    id: row.id,
    note: row.note,
    created: row.created,
    updated: row.updated,
    updatedBy: row.updated_by,
    revision: row.revision,
    immutable: row.immutable,
    valid: itemsValid(designVersionItems(row)),
  };
}

/** A stored codebook as served. */
export function toDesignVersion(row: DesignVersionRow): DesignVersion {
  return { ...toDesignVersionMeta(row), studyId: row.study_id, items: storedItems(row), units: designVersionUnits(row), session: designVersionSession(row), public: designVersionPublic(row) };
}
