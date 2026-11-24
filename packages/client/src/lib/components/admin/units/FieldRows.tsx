import { useState } from "react";
import { isRoleColumn, isSetType, type FieldUse, type UnitField, type UnitFieldType } from "@annotinder/contracts";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_INFO, roleLabel } from "../../../admin/setKinds";

const USE_LABEL: Record<FieldUse | "none", { label: string; title: string; className: string }> = {
  shown: {
    label: "shown",
    title: "In a layout, a question or an end message: coders see it",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  sent: {
    label: "sent, not shown",
    title:
      "Only in conditions the browser evaluates: sent to coders, not shown (anyone looking behind the scenes can see it)",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  server: {
    label: "server only",
    title:
      "An answer column of gold or practice questions, or a column with a role the design uses (the test set in every unit loop): read on the server, never sent to coders",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  none: {
    label: "not used",
    title: "The design doesn't use it: kept with the units, never sent to coders",
    className: "bg-muted text-muted-foreground",
  },
};

const TYPES: UnitFieldType[] = ["text", "number", "boolean", "list"];

function TypeSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: UnitFieldType;
  onChange: (type: UnitFieldType) => void;
}) {
  return (
    <select
      aria-label={`Type of ${name}`}
      className="h-7 rounded-md border border-input bg-background px-1.5"
      value={value}
      onChange={(e) => onChange(e.target.value as UnitFieldType)}
    >
      {TYPES.map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  );
}

/** A field of the units: its type, how the design uses it, its description, and removing it if the design doesn't use it. */
export function FieldRow({
  field,
  use,
  onChange,
  onRemove,
}: {
  field: UnitField;
  /** How the design uses it; undefined: it doesn't. */
  use: FieldUse | undefined;
  onChange: (field: UnitField) => void;
  onRemove: () => void;
}) {
  const usage = USE_LABEL[use ?? "none"];
  const describe = (text: string) => {
    const description = text.trim();
    if (description !== (field.description ?? "")) onChange({ ...field, description: description || undefined });
  };
  return (
    <tr className="border-t border-border">
      <td className="px-2 py-1 font-mono">{field.name}</td>
      <td className="px-2 py-1">
        {isSetType(field.type) ? (
          // A column with a role: its type follows from its name
          <span
            className="inline-flex h-7 items-center px-1.5"
            title={isRoleColumn(field.name) ? `${field.name}: ${ROLE_INFO[field.name]}` : undefined}
          >
            {roleLabel(field.name)}
          </span>
        ) : (
          <TypeSelect name={field.name} value={field.type} onChange={(type) => onChange({ ...field, type })} />
        )}
      </td>
      <td className="px-2 py-1">
        <span title={usage.title} className={`rounded px-1.5 py-0.5 ${usage.className}`}>
          {usage.label}
        </span>
      </td>
      <td className="px-2 py-1">
        <Input
          aria-label={`Description of ${field.name}`}
          className="h-7 text-xs"
          defaultValue={field.description ?? ""}
          placeholder="What it holds"
          onBlur={(e) => describe(e.target.value)}
        />
      </td>
      <td className="px-2 py-1 text-right">
        {use === undefined && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove field ${field.name}`}
            title="Remove the field and its values from the draft units (deployed units keep them until the next deploy)"
            onClick={() => confirm(`Remove field ${field.name}, and its values from the units?`) && onRemove()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}

/** A field the design uses but doesn't declare: declare it, with a type. */
export function UndeclaredFieldRow({ name, onDeclare }: { name: string; onDeclare: (field: UnitField) => void }) {
  const [type, setType] = useState<UnitFieldType>("text");
  return (
    <tr className="border-t border-border bg-amber-500/5">
      <td className="px-2 py-1 font-mono">{name}</td>
      <td className="px-2 py-1">
        <TypeSelect name={name} value={type} onChange={setType} />
      </td>
      <td className="px-2 py-1 text-amber-700 dark:text-amber-400" colSpan={2}>
        Used, not declared: the units don&apos;t have it yet
      </td>
      <td className="px-2 py-1 text-right">
        <Button size="sm" variant="outline" className="h-7" onClick={() => onDeclare({ name, type })}>
          Declare
        </Button>
      </td>
    </tr>
  );
}
