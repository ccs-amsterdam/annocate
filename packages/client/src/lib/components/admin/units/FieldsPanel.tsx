import { useMemo, useState } from "react";
import { fieldUsage, undeclaredFields, type FieldUse, type TopLevelItem, type UnitField, type UnitFieldType } from "@annotinder/contracts";
import { Trash2 } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDesignVersionQuery, useDesignVersionsQuery, useUnitFieldsMutation } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldBadge } from "./FieldBadge";

const USE_LABEL: Record<FieldUse | "none", { label: string; title: string; className: string }> = {
  shown: { label: "shown", title: "In a layout, a question or an end message: coders see it", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  sent: {
    label: "sent, not shown",
    title: "Only in conditions the browser evaluates: sent to coders, not shown (anyone looking behind the scenes can see it)",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  server: { label: "server only", title: "An answer column of gold or practice questions: never sent to coders", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  none: { label: "not used", title: "The codebook doesn't use it: kept with the units, never sent to coders", className: "bg-muted text-muted-foreground" },
};

const TYPES: UnitFieldType[] = ["text", "number", "boolean"];

/**
 * The design's unit fields (docs/plans/design.md §3): per field its type,
 * how the codebook (its latest version) uses it, and a description. Fields
 * the codebook doesn't use can be removed (their values leave the draft
 * units); fields it uses but the design doesn't declare can be declared.
 */
export function FieldsPanel({ client, fields }: { client: ResearcherApi; fields: UnitField[] }) {
  const codebooks = useDesignVersionsQuery(client).data ?? [];
  const latest = useDesignVersionQuery(client, codebooks.at(-1)?.id ?? null).data;
  const items = useMemo(() => (latest?.items ?? []) as TopLevelItem[], [latest]);
  const usage = useMemo(() => fieldUsage(items), [items]);
  const undeclared = useMemo(() => undeclaredFields(items, fields), [items, fields]);
  const save = useUnitFieldsMutation(client);
  const [declareTypes, setDeclareTypes] = useState<Record<string, UnitFieldType>>({});
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
        {undeclared.length > 0 && <span className="text-amber-700 dark:text-amber-400">The codebook uses fields the design doesn't declare: {undeclared.join(", ")}</span>}
      </div>
      {open && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Field</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">In the codebook</th>
                <th className="px-2 py-1 font-medium">Description</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const use = USE_LABEL[usage.get(f.name) ?? "none"];
                return (
                  <tr key={f.name} className="border-t border-border">
                    <td className="px-2 py-1 font-mono">{f.name}</td>
                    <td className="px-2 py-1">
                      <select
                        aria-label={`Type of ${f.name}`}
                        className="h-7 rounded-md border border-input bg-background px-1.5"
                        value={f.type}
                        onChange={(e) => put(fields.map((x) => (x.name === f.name ? { ...x, type: e.target.value as UnitFieldType } : x)))}
                      >
                        {TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <span title={use.title} className={`rounded px-1.5 py-0.5 ${use.className}`}>
                        {use.label}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        aria-label={`Description of ${f.name}`}
                        className="h-7 text-xs"
                        defaultValue={f.description ?? ""}
                        placeholder="What it holds"
                        onBlur={(e) => {
                          const description = e.target.value.trim();
                          if (description === (f.description ?? "")) return;
                          put(fields.map((x) => (x.name === f.name ? { ...x, ...(description ? { description } : { description: undefined }) } : x)));
                        }}
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      {!usage.has(f.name) && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove field ${f.name}`}
                          title="Remove the field and its values from the draft units (deployed units keep them until the next deploy)"
                          onClick={() => confirm(`Remove field ${f.name}, and its values from the units?`) && put(fields.filter((x) => x.name !== f.name))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {undeclared.map((name) => (
                <tr key={name} className="border-t border-border bg-amber-500/5">
                  <td className="px-2 py-1 font-mono">{name}</td>
                  <td className="px-2 py-1">
                    <select
                      aria-label={`Type of ${name}`}
                      className="h-7 rounded-md border border-input bg-background px-1.5"
                      value={declareTypes[name] ?? "text"}
                      onChange={(e) => setDeclareTypes({ ...declareTypes, [name]: e.target.value as UnitFieldType })}
                    >
                      {TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-amber-700 dark:text-amber-400" colSpan={2}>
                    Used, not declared: the units don&apos;t have it yet
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => put([...fields, { name, type: declareTypes[name] ?? "text" }])}>
                      Declare
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {save.error && <p className="border-t border-border bg-destructive/10 p-2 text-destructive">{save.error.message}</p>}
        </div>
      )}
    </div>
  );
}
