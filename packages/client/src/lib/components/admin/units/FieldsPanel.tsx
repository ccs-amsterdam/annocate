import { useMemo, useState } from "react";
import { fieldUsage, undeclaredFields, type TopLevelItem, type UnitField } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDesignVersionQuery, useDesignVersionsQuery, useUnitFieldsMutation } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { FieldBadge } from "./FieldBadge";
import { FieldRow, UndeclaredFieldRow } from "./FieldRows";

/**
 * The design's unit fields (docs/architecture.md §8.4): per field its type,
 * how the design (its latest version) uses it, and a description. Fields
 * the design doesn't use can be removed (their values leave the draft
 * units); fields it uses but the design doesn't declare can be declared.
 */
export function FieldsPanel({ client, fields }: { client: ResearcherApi; fields: UnitField[] }) {
  const designVersions = useDesignVersionsQuery(client).data ?? [];
  const latest = useDesignVersionQuery(client, designVersions.at(-1)?.id ?? null).data;
  const items = useMemo(() => (latest?.items ?? []) as TopLevelItem[], [latest]);
  const usage = useMemo(() => fieldUsage(items), [items]);
  const undeclared = useMemo(() => undeclaredFields(items, fields), [items, fields]);
  const save = useUnitFieldsMutation(client);
  const [open, setOpen] = useState(false);

  const put = (next: UnitField[]) => save.mutate(next);

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        Fields:
        {fields.map((f) => (
          <FieldBadge key={f.name} field={f} />
        ))}
        <Button variant="link" size="sm" className="h-auto px-1 text-xs" onClick={() => setOpen(!open)}>
          {open ? "Hide details" : "Details"}
        </Button>
        {undeclared.length > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            The design uses fields it doesn't declare: {undeclared.join(", ")}
          </span>
        )}
      </div>
      {open && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Field</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">In the design</th>
                <th className="px-2 py-1 font-medium">Description</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <FieldRow
                  key={f.name}
                  field={f}
                  use={usage.get(f.name)}
                  onChange={(next) => put(fields.map((x) => (x.name === f.name ? next : x)))}
                  onRemove={() => put(fields.filter((x) => x.name !== f.name))}
                />
              ))}
              {undeclared.map((name) => (
                <UndeclaredFieldRow key={name} name={name} onDeclare={(field) => put([...fields, field])} />
              ))}
            </tbody>
          </table>
          {save.error && (
            <p className="border-t border-border bg-destructive/10 p-2 text-destructive">{save.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
