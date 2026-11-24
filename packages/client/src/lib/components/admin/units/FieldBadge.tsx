import type { UnitField, UnitFieldType } from "@annotinder/contracts";
import { FlaskConical, Hash, Tags, ToggleLeft, Type, List } from "lucide-react";
import { roleLabel } from "../../../admin/setKinds";

const ICON: Record<UnitFieldType, typeof Type> = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  list: List,
  set: Tags,
  unit_type: FlaskConical,
};

/** A unit field's name with an icon for its type (a column with a role: its role). */
export function FieldBadge({ field }: { field: UnitField }) {
  const Icon = ICON[field.type];
  const role = roleLabel(field.name);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
      title={role !== field.name ? `${field.name}: ${role}` : `${field.name}: ${field.type}`}
    >
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="font-mono">{field.name}</span>
    </span>
  );
}
