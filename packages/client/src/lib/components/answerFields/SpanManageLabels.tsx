import { useState, useEffect } from "react";
import type { SpanAnswer, SpanSlice } from "@annotinder/contracts";
import type { SpanAnnotationState } from "../../context/SpanAnnotationContext";
import { useCoderSettings } from "../../context/CoderSettingsContext";
import { getCodeBadgeStyle } from "../../utils/color";
import { truncateSpanText } from "../SelectableText";
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
export function SpanManageLabels({
  annotation,
  spans,
  initialTargetSpanId,
  fallbackSlices,
}: SpanManageLabelsProps) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(
    initialTargetSpanId ?? null,
  );

  function colorFor(code: string): string | undefined {
    return annotation.codes.find((c) => c.code === code)?.color;
  }

  const activeSpan = spans.find((s) => s.id === selectedSpanId) ?? null;

  // Keyboard navigation when in list mode
  useEffect(() => {
    if (activeSpan) return;

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "Escape") {
        e.preventDefault();
        annotation.setPendingSpan(null);
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= spans.length) {
        e.preventDefault();
        setSelectedSpanId(spans[num - 1].id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotation, activeSpan, spans]);

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
    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-1">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">
          Current labels ({spans.length}):
        </span>

        {/* Clear cancel icon */}
        <button
          type="button"
          onClick={() => annotation.setPendingSpan(null)}
          className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
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
          const badgeStyle = getCodeBadgeStyle(colorFor(s.code), isDark);
          const spanSummary = s.slices.map((sl) => sl.text).join(" ... ");
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSpanId(s.id)}
              className="relative flex w-full items-center justify-between gap-2.5 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:bg-muted/60 hover:border-primary/40 transition-all cursor-pointer shadow-2xs group"
            >
              {idx < 9 && <ShortcutBadge shortcut={String(idx + 1)} />}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  style={badgeStyle}
                  className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold shrink-0"
                >
                  {s.code}
                </span>
                <span
                  className="text-xs font-serif italic text-foreground/90 truncate"
                  title={spanSummary}
                >
                  &ldquo;{truncateSpanText(spanSummary, 50)}&rdquo;
                </span>
                {s.slices.length > 1 && (
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground shrink-0">
                    {s.slices.length} frags
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                <span>Edit</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Button to create a new label on this text */}
      {candidateSlices && candidateSlices.length > 0 && (
        <div className="pt-1 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 cursor-pointer"
            onClick={() => {
              annotation.setPendingSpan({
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
