import {
  UnitsSpecSchema,
  codebookErrors,
  designItems,
  type DesignVersionMeta,
  type DesignVersion,
  type SessionSpec,
  type TopLevelItem,
  type UnitsSpec,
} from "@annotinder/contracts";

/** A row of `design_versions`: a version of the design. */
export interface DesignVersionRow {
  id: number;
  job_id: number;
  note: string | null;
  items: unknown;
  units: unknown;
  session: unknown;
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

/** A stored codebook's session (docs/plans/design.md §2). */
export function codebookSession(row: Pick<DesignVersionRow, "session">): SessionSpec | null {
  return (row.session as SessionSpec | null) ?? null;
}

/** A stored codebook's items with its session as the first item: what validation, links and the runtime work on. */
export function codebookItems(row: Pick<DesignVersionRow, "items" | "session">): TopLevelItem[] {
  return designItems({ items: storedItems(row), session: codebookSession(row) }) as TopLevelItem[];
}

/** A stored codebook's unit fields (docs/plans/design.md §3). */
export function codebookUnits(row: Pick<DesignVersionRow, "units">): UnitsSpec {
  const parsed = UnitsSpecSchema.safeParse(row.units);
  return parsed.success ? parsed.data : { fields: [] };
}

/** Whether the items pass validation, as required to deploy or preview them. */
export function itemsValid(items: unknown[]): boolean {
  return items.length > 0 && codebookErrors(items).length === 0;
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
    valid: itemsValid(codebookItems(row)),
  };
}

/** A stored codebook as served. */
export function toDesignVersion(row: DesignVersionRow): DesignVersion {
  return { ...toDesignVersionMeta(row), jobId: row.job_id, items: storedItems(row), units: codebookUnits(row), session: codebookSession(row) };
}
