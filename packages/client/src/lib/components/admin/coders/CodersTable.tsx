import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { CoderKind, CoderResponse } from "@annotinder/contracts";
import {
  CODER_COLUMN_LABELS,
  coderColumns,
  nextSort,
  type CoderColumn,
  type CoderSort,
} from "../../../admin/codersTable";
import { formatWhen } from "../../../admin/format";
import { DraftMarker } from "./DraftMarker";

const NUMBERS: CoderColumn[] = ["assigned", "assignedDraft", "done", "remaining"];
const align = (column: CoderColumn) => (NUMBERS.includes(column) ? "text-right" : "text-left");

/**
 * The study's coders of one kind, a row each: who they are, their units
 * (deployed and in the draft, with a marker where those differ), what they
 * did and what is left. Every column sorts; `actions`: a row's buttons.
 */
export function CodersTable({
  kind,
  coders,
  sort,
  onSort,
  actions,
}: {
  kind: CoderKind;
  /** In the table's order. */
  coders: CoderResponse[];
  sort: CoderSort;
  onSort: (sort: CoderSort) => void;
  actions: (coder: CoderResponse) => ReactNode;
}) {
  const columns = coderColumns(kind);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            {columns.map((column) => (
              <ColumnHeader key={column} column={column} sort={sort} onSort={onSort} />
            ))}
            <th className="p-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {coders.map((coder) => (
            <tr key={coder.id} className="border-b last:border-0">
              {columns.map((column) => (
                <td key={column} className={`p-2 ${align(column)}`}>
                  <CoderCell coder={coder} column={column} />
                </td>
              ))}
              <td className="p-2 text-right whitespace-nowrap">{actions(coder)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A column's header: a click sorts by it, another turns the order round. */
function ColumnHeader({
  column,
  sort,
  onSort,
}: {
  column: CoderColumn;
  sort: CoderSort;
  onSort: (sort: CoderSort) => void;
}) {
  const sorted = sort.column === column;
  const Arrow = sort.descending ? ArrowDown : ArrowUp;
  return (
    <th
      scope="col"
      className={`p-2 font-medium ${align(column)}`}
      aria-sort={sorted ? (sort.descending ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
        onClick={() => onSort(nextSort(sort, column))}
      >
        {CODER_COLUMN_LABELS[column]}
        {sorted && <Arrow className="h-3 w-3" aria-hidden="true" />}
      </button>
    </th>
  );
}

/** A coder's value in a column, as the table shows it. */
function CoderCell({ coder, column }: { coder: CoderResponse; column: CoderColumn }) {
  if (column === "coder") return <span className="font-medium">{coder.coder}</span>;
  if (column === "email") return <span className="text-muted-foreground">{coder.email ?? "–"}</span>;
  if (column === "lastActive") return <span className="whitespace-nowrap">{formatWhen(coder.lastActive)}</span>;
  return (
    <span className="tabular-nums">
      {coder[column] ?? "–"}
      {column === "assignedDraft" && coder.draftDiffers && <DraftMarker coder={coder.coder} />}
    </span>
  );
}
