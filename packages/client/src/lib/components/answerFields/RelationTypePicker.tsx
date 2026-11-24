import { ArrowRight } from "lucide-react";
import { optionLabel, type NominalOption } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { RelationAnnotationState } from "../../context/relationAnnotation";
import { getCodeButtonStyle } from "../../utils/color";
import { ShortcutBadge } from "../ShortcutBadge";
import { spanName } from "./relationSpans";

/**
 * Two spans were clicked: the relation's type, among those that can go from
 * the one to the other. A type the two already have is removed by choosing
 * it again.
 */
export function RelationTypePicker({
  ctx,
  pending,
  options,
  keys,
  isDark,
}: {
  ctx: RelationAnnotationState;
  pending: NonNullable<RelationAnnotationState["pending"]>;
  /** The types to choose from. */
  options: NominalOption[];
  /** Each type's key, for its badge. */
  keys: (string | null)[];
  isDark: boolean;
}) {
  const span = (id: string) => ctx.spans.find((s) => s.id === id);
  const chosen = (type: string) =>
    ctx.relations.some((r) => r.fromId === pending.fromId && r.toId === pending.toId && r.value === type);
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Relation type">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">{spanName(span(pending.fromId))}</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="truncate">{spanName(span(pending.toId))}</span>
        </span>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={ctx.cancel}>
          Cancel
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option, i) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={chosen(option.value)}
            onClick={() => ctx.choose(option.value)}
            className="relative flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs font-semibold shadow-xs"
            style={getCodeButtonStyle(option.color, chosen(option.value), isDark)}
          >
            {keys[i] && <ShortcutBadge shortcut={keys[i]!} />}
            {optionLabel(option)}
            {chosen(option.value) && <span className="ml-1 font-normal">(remove)</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
