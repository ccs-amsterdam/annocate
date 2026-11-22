import type { NominalOption, SpanAnswer } from "@annotinder/contracts";
import { ChevronRight } from "lucide-react";
import { getCodeBadgeStyle } from "../../utils/color";
import { ShortcutBadge } from "../ShortcutBadge";
import { optionColor, optionLabelOf, spanSummary, truncateSpanText } from "../spanText";

/**
 * A labelled span in a list, to open it for editing: its label, its text
 * and "Edit". `menu`: in the menu of the spans on a clicked word, with a
 * number key (`shortcut`); `list`: in the list of all the unit's spans.
 */
export function SpanListRow({
  span,
  options,
  isDark,
  variant,
  shortcut,
  onClick,
}: {
  span: SpanAnswer;
  options: NominalOption[];
  isDark: boolean;
  variant: "menu" | "list";
  shortcut?: string;
  onClick: () => void;
}) {
  const summary = spanSummary(span.slices);
  const menu = variant === "menu";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full cursor-pointer items-center justify-between rounded-lg border border-border/70 bg-background/80 px-3 text-left shadow-2xs transition-all hover:border-primary/40 hover:bg-muted/60 ${
        menu ? "relative gap-2.5 py-2" : "gap-2 py-1.5"
      }`}
    >
      {shortcut && <ShortcutBadge shortcut={shortcut} />}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          style={getCodeBadgeStyle(optionColor(options, span.value), isDark)}
          className="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
        >
          {optionLabelOf(options, span.value)}
        </span>
        <span className="truncate font-serif text-xs text-foreground/90 italic" title={summary}>
          &ldquo;{truncateSpanText(summary, menu ? 50 : 55)}&rdquo;
        </span>
        {span.slices.length > 1 && (
          <span className="py-0.2 shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            {span.slices.length} frags
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
        <span>Edit</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}
