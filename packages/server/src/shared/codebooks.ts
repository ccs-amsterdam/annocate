import { migrateCodebookItems, type CodebookMeta, type CodebookResponse } from "@annotinder/contracts";

/** A row of `codebooks`. */
export interface CodebookRow {
  id: number;
  job_id: number;
  note: string | null;
  items: CodebookResponse["items"];
  created: Date;
  immutable: boolean;
}

/** A stored codebook as served; codebooks stored in an older shape are migrated (contracts migrate.ts). */
export function toCodebookResponse(row: CodebookRow): CodebookResponse {
  const items = migrateCodebookItems(row.items) as CodebookResponse["items"];
  return { id: row.id, jobId: row.job_id, note: row.note, items, created: row.created, immutable: row.immutable };
}

export function toCodebookMeta(row: CodebookRow): CodebookMeta {
  return { id: row.id, note: row.note, created: row.created, immutable: row.immutable };
}
