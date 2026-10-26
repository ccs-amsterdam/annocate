import type { CodebookMeta, CodebookResponse } from "@annotinder/contracts";
import type { CodebookRow } from "./deployments.js";

export function toCodebookResponse(row: CodebookRow): CodebookResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    note: row.note,
    items: JSON.parse(row.items),
    created: new Date(row.created),
    immutable: !!row.immutable,
  };
}

export function toCodebookMeta(row: CodebookRow): CodebookMeta {
  return { id: row.id, note: row.note, created: new Date(row.created), immutable: !!row.immutable };
}
