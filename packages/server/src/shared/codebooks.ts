import type { CodebookMeta, CodebookResponse } from "@annotinder/contracts";

/** A row of `codebooks`. */
export interface CodebookRow {
  id: number;
  job_id: number;
  note: string | null;
  items: CodebookResponse["items"];
  created: Date;
  immutable: boolean;
}

export function toCodebookResponse(row: CodebookRow): CodebookResponse {
  return { id: row.id, jobId: row.job_id, note: row.note, items: row.items, created: row.created, immutable: row.immutable };
}

export function toCodebookMeta(row: CodebookRow): CodebookMeta {
  return { id: row.id, note: row.note, created: row.created, immutable: row.immutable };
}
