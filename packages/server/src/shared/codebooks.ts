import { codebookErrors, type CodebookMeta, type CodebookResponse, type TopLevelItem } from "@annotinder/contracts";

/** A row of `codebooks`. */
export interface CodebookRow {
  id: number;
  job_id: number;
  note: string | null;
  items: unknown;
  created: Date;
  updated: Date;
  updated_by: string | null;
  revision: number;
  immutable: boolean;
}

/** A stored codebook's items. */
export function codebookItems(row: Pick<CodebookRow, "items">): TopLevelItem[] {
  return (Array.isArray(row.items) ? row.items : []) as TopLevelItem[];
}

/** Whether the items pass validation, as required to publish or preview them. */
export function itemsValid(items: unknown[]): boolean {
  return items.length > 0 && codebookErrors(items).length === 0;
}

export function toCodebookMeta(row: CodebookRow): CodebookMeta {
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
export function toCodebookResponse(row: CodebookRow): CodebookResponse {
  return { ...toCodebookMeta(row), jobId: row.job_id, items: codebookItems(row) };
}
