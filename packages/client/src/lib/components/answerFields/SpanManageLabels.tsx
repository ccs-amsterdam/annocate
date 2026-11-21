import { optionLabel } from "@annotinder/contracts";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope } from "../../keyboard/hooks";
import { useState, useEffect } from "react";
import type { SpanAnswer, SpanSlice } from "@annotinder/contracts";
import type { SpanAnnotationState } from "../../context/spanAnnotation";
import { useCoderSettings } from "../../context/coderSettings";
import { getCodeBadgeStyle } from "../../utils/color";
import { truncateSpanText } from "../spanText";
import { ShortcutBadge } from "../ShortcutBadge";
import { SpanEditLabel } from "./SpanEditLabel";
import { Button } from "@/components/ui/button";
import { ChevronRight, X, Plus } from "lucide-react";

export interface SpanManageLabelsProps {
  annotation: SpanAnnotationState;
  spans: SpanAnswer[];
  initialTargetSpanId?: string;
  fallbackSlices?: SpanSlice[];
}

/**
 * Controller for managing existing labels on a text segment or unit list item.
 *
 * Requirements:
 * - Whenever you click a word with an existing label (even if only 1 label),
 *   you first see the menu showing the current label(s) and the "Create new label" button.
 * - Clicking an existing label in this menu opens `SpanEditLabel` to edit the code or delete.
 * - Clicking "Create new label" enters creation mode to add an overlapping label on this text.
 */
export function SpanManageLabels({ annotation, spans, initialTargetSpanId, fallbackSlices }: SpanManageLabelsProps) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(initialTargetSpanId ?? null);

  function colorFor(code: string): string | undefined {
    return annotation.options.find((c) => c.value === code)?.color;
  }

  function labelFor(value: string): string {
    const option = annotation.options.find((c) => c.value === value);
    return option ? optionLabel(option) : value;
  }

  const activeSpan = spans.find((s) => s.id === selectedSpanId) ?? null;

  // The span being edited is highlighted in the text
  const activeId = activeSpan?.id ?? null;
  useEffect(() => {
    if (activeId) annotation.setFocusedSpanId(activeId);
  }, [activeId, annotation]);

  // The list of spans: number keys open one, Escape leaves
  useKeyScope(
    (press) => {
      if (press.key === "Escape") {
        annotation.setPendingSpan(null);
        return true;
      }
      const num = parseInt(press.key, 10);
      if (isNaN(num) || num < 1 || num > spans.length) return false;
      setSelectedSpanId(spans[num - 1].id);
      return true;
    },
    !activeSpan,
    { priority: PRIORITY.editor },
  );

  // If a label is selected for editing, render SpanEditLabel with a Back action to return to this menu
  if (activeSpan) {
    return (
      <SpanEditLabel
        annotation={annotation}
        span={activeSpan}
        onBack={() => setSelectedSpanId(null)}
        onCancel={() => annotation.setPendingSpan(null)}
        onCodeChanged={() => annotation.setPendingSpan(null)}
        onDelete={() => annotation.setPendingSpan(null)}
      />
    );
  }

  const candidateSlices = fallbackSlices ?? (spans.length > 0 ? spans[0].slices : null);

  // Label inspection menu
  return (
    <div className="flex animate-in flex-col gap-2 fade-in slide-in-from-bottom-1">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Current labels ({spans.length}):</span>

        {/* Clear cancel icon */}
        <button
          type="button"
          onClick={() => annotation.setPendingSpan(null)}
          className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          title="Cancel (Esc)"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
          <ShortcutBadge shortcut="Esc" />
        </button>
      </div>

      {/* List of current labels on this text */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        {spans.map((s, idx) => {
          const badgeStyle = getCodeBadgeStyle(colorFor(s.value), isDark);
          const spanSummary = s.slices.map((sl) => sl.text).join(" ... ");
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSpanId(s.id)}
              className="group relative flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left shadow-2xs transition-all hover:border-primary/40 hover:bg-muted/60"
            >
              {idx < 9 && <ShortcutBadge shortcut={String(idx + 1)} />}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  style={badgeStyle}
                  className="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
                >
                  {labelFor(s.value)}
                </span>
                <span className="truncate font-serif text-xs text-foreground/90 italic" title={spanSummary}>
                  &ldquo;{truncateSpanText(spanSummary, 50)}&rdquo;
                </span>
                {s.slices.length > 1 && (
                  <span className="py-0.2 shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                    {s.slices.length} frags
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
                <span>Edit</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Button to create a new label on this text */}
      {candidateSlices && candidateSlices.length > 0 && (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 cursor-pointer gap-1 text-xs"
            onClick={() => {
              annotation.setPendingSpan({
                field: annotation.pendingSpan?.field,
                slices: candidateSlices,
                anchorOffset: candidateSlices[0]?.offset,
                mode: "create",
              });
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create new label</span>
          </Button>
        </div>
      )}
    </div>
  );
}
