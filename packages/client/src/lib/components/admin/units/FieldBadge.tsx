import type { UnitField } from "@annotinder/contracts";
import { Hash, ToggleLeft, Type } from "lucide-react";

const ICON = { text: Type, number: Hash, boolean: ToggleLeft };

/** A unit field's name with an icon for its type. */
export function FieldBadge({ field }: { field: UnitField }) {
  const Icon = ICON[field.type];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
      title={`${field.name}: ${field.type}`}
    >
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="font-mono">{field.name}</span>
    </span>
  );
}
