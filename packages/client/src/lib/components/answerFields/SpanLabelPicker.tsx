import { optionLabel } from "@annotinder/contracts";
import { X } from "lucide-react";
import type { PendingSpan, SpanAnnotationState } from "../../context/spanAnnotation";
import { getCodeButtonStyle } from "../../utils/color";
import { ShortcutBadge } from "../ShortcutBadge";
import { spanSummary, truncateSpanText } from "../spanText";

/** A new selection: pick its label (the keys are `useSpanLabelKeys`). */
export function SpanLabelPicker({
  annotation,
  pending,
  labelKeys,
  isDark,
}: {
  annotation: SpanAnnotationState;
  pending: PendingSpan;
  /** Each label's key, for its badge. */
  labelKeys: (string | null)[];
  isDark: boolean;
}) {
  const label = (value: string) => {
    annotation.addSpan(pending.slices, value);
    annotation.setPendingSpan(null);
  };
  const cancel = () => annotation.setPendingSpan(null);

  return (
    <div className="flex animate-in flex-col gap-2 fade-in slide-in-from-bottom-1">
      <div className="flex items-center justify-between gap-2">
        <SelectionSummary pending={pending} allowGaps={annotation.allowGaps} />
        <button
          type="button"
          onClick={cancel}
          className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          title="Cancel selection (Esc)"
          aria-label="Cancel selection"
        >
          <X className="h-4 w-4" />
          <ShortcutBadge shortcut="Esc" />
        </button>
      </div>

      {/* In a wide coding area the labels are at the selection (SpanLabelMenu); narrower, here, near the thumbs */}
      <p className="hidden text-xs text-muted-foreground @2xl:block">
        Pick a label at the selection{labelKeys.some(Boolean) ? ", or press its key" : ""}.
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5 @2xl:hidden">
        {annotation.options.map((option, idx) => (
          <button
            key={option.value}
            type="button"
            // The arrows reach it; a selection made with the keyboard focuses the first
            data-key-target=""
            data-span-label=""
            className="relative flex max-w-[180px] min-w-[95px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-xs transition-all hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
            style={getCodeButtonStyle(option.color, false, isDark)}
            onClick={() => label(option.value)}
          >
            {labelKeys[idx] && <ShortcutBadge shortcut={labelKeys[idx]!} />}
            <span className="truncate">{optionLabel(option)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** What is selected: its text, in how many parts, and how to add gaps. */
function SelectionSummary({ pending, allowGaps }: { pending: PendingSpan; allowGaps: boolean }) {
  const summary = spanSummary(pending.slices);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="shrink-0 text-xs font-semibold text-foreground">Label as:</span>
      <span
        className="max-w-sm truncate font-serif text-xs text-muted-foreground italic sm:max-w-md sm:text-sm"
        title={summary}
      >
        &ldquo;{truncateSpanText(summary, 55)}&rdquo;
      </span>
      {pending.slices.length > 1 && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {pending.slices.length} frags
        </span>
      )}
      {allowGaps && (
        <span className="hidden shrink-0 text-[10px] text-muted-foreground italic sm:inline">
          (tap words to toggle gaps)
        </span>
      )}
    </div>
  );
}
