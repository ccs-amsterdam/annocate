import { useState } from "react";
import { TEST_SET, type RoleColumn, type UnitField, type UnitResponse } from "@annotinder/contracts";
import { FlaskConical, Lock, Tags, Trash2 } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDeleteUnitMutation } from "../../../admin/queries";
import { cn } from "cn";
import { ROLE_INFO, ROLE_LABELS } from "../../../admin/setKinds";
import { unitFieldText } from "../../../admin/unitsTable";
import { UnitDialog } from "./UnitDialog";

/** Role columns stand apart from the data columns: a faint tint. */
const ROLE_CELL = "w-px whitespace-nowrap bg-primary/[0.04] dark:bg-primary/[0.08]";

/** A page of units: a column per role column and per field; select units, open one, delete one that isn't coded. */
export function UnitTable({
  client,
  units,
  fields,
  groups,
  cells,
  selected,
  onSelectedChange,
  loading,
}: {
  client: ResearcherApi;
  units: UnitResponse[];
  fields: UnitField[];
  /** The role columns: a column each. */
  groups: RoleColumn[];
  /** group -> unit id -> the unit's sets in it (a cell as in a CSV). */
  cells: Map<string, Map<number, string>>;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  loading: boolean;
}) {
  const deleteUnit = useDeleteUnitMutation(client);
  const [shown, setShown] = useState<number | null>(null);
  const allOnPage = units.length > 0 && units.every((u) => selected.has(u.id));

  function toggle(ids: number[], on: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onSelectedChange(next);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading units...</p>;
  if (units.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="w-8 p-2">
              <input
                type="checkbox"
                aria-label="Select all units on this page"
                checked={allOnPage}
                onChange={(e) =>
                  toggle(
                    units.map((u) => u.id),
                    e.target.checked,
                  )
                }
              />
            </th>
            <th className="p-2 font-medium">id</th>
            {groups.map((g) => (
              <th key={g} className={cn("p-2 font-medium", ROLE_CELL)} title={`${g}: ${ROLE_INFO[g]}`}>
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 whitespace-nowrap text-primary">
                  {g === TEST_SET ? <FlaskConical className="h-3 w-3" /> : <Tags className="h-3 w-3" />}
                  {ROLE_LABELS[g]}
                </span>
              </th>
            ))}
            {fields.map((f) => (
              <th key={f.name} className={`p-2 font-medium ${f.type === "text" ? "" : "text-right"}`}>
                {f.name}
              </th>
            ))}
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr
              key={unit.id}
              // Practice units: a faint leaf tint
              className={cn(
                "border-b align-top last:border-0",
                (cells.get(TEST_SET)?.get(unit.id) ?? "").split("#")[0].trim() === "practice" && "bg-leaf/10",
              )}
            >
              <td className="p-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${unit.externalId}`}
                  checked={selected.has(unit.id)}
                  onChange={(e) => toggle([unit.id], e.target.checked)}
                />
              </td>
              <td className="p-2 font-mono text-xs">
                <button
                  type="button"
                  className="cursor-pointer text-left underline-offset-2 hover:underline"
                  title="Show this unit"
                  onClick={() => setShown(unit.id)}
                >
                  {unit.externalId}
                </button>
              </td>
              {groups.map((g) => (
                <td key={g} className={cn("p-2 font-mono text-[11px] text-muted-foreground", ROLE_CELL)}>
                  {cells.get(g)?.get(unit.id) ?? ""}
                </td>
              ))}
              {fields.map((f) => (
                <FieldCell key={f.name} field={f} value={unit.data[f.name]} />
              ))}
              <td className="p-2 text-right">
                {unit.coded ? (
                  <span title="Coded: it can't be deleted; replacing it (by uploading it again) keeps what coders saw">
                    <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                ) : (
                  <button
                    type="button"
                    title="Delete unit"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => confirm(`Delete unit "${unit.externalId}"?`) && deleteUnit.mutate(unit.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {deleteUnit.isError && <p className="p-2 text-sm text-destructive">{deleteUnit.error.message}</p>}
      <UnitDialog client={client} id={shown} fields={fields} onClose={() => setShown(null)} />
    </div>
  );
}

function FieldCell({ field, value }: { field: UnitField; value: UnitResponse["data"][string] | undefined }) {
  const text = unitFieldText(value);
  if (text === "") return <td className="p-2 text-muted-foreground">–</td>;
  // A list: its labels
  if (Array.isArray(value)) return <td className="max-w-sm p-2">{text}</td>;
  if (field.type !== "text") return <td className="p-2 text-right tabular-nums">{text}</td>;
  return (
    <td className="max-w-sm p-2" title={text.length > 120 ? text : undefined}>
      <span className="line-clamp-2">{text}</span>
    </td>
  );
}
