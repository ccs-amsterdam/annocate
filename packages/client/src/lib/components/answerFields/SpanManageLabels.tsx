import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope } from "../../keyboard/hooks";
import { useState, useEffect } from "react";
import type { SpanAnswer, SpanSlice } from "@annotinder/contracts";
import type { SpanAnnotationState } from "../../context/spanAnnotation";
import { useCoderSettings } from "../../context/coderSettings";
import { ShortcutBadge } from "../ShortcutBadge";
import { SpanEditLabel } from "./SpanEditLabel";
import { SpanListRow } from "./SpanListRow";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";

export interface SpanManageLabelsProps {
  annotation: SpanAnnotationState;
  /** The spans on the clicked text. */
  spans: SpanAnswer[];
  /** A span to open for editing at once. */
  initialTargetSpanId?: string;
  /** The text a new label goes on; default: the first span's. */
  fallbackSlices?: SpanSlice[];
}

/**
 * The spans on a word the coder clicked (always this menu first, even for
 * one span): pick one to change its label or delete it (`SpanEditLabel`),
 * or create another label on the same text (overlapping spans).
 */
export function SpanManageLabels({ annotation, spans, initialTargetSpanId, fallbackSlices }: SpanManageLabelsProps) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(initialTargetSpanId ?? null);

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

  // A span picked for editing; Back returns to this menu
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

  return (
    <div className="flex animate-in flex-col gap-2 fade-in slide-in-from-bottom-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Current labels ({spans.length}):</span>

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

      <div className="flex flex-col gap-1.5 pt-0.5">
        {spans.map((span, idx) => (
          <SpanListRow
            key={span.id}
            span={span}
            options={annotation.options}
            isDark={isDark}
            variant="menu"
            shortcut={idx < 9 ? String(idx + 1) : undefined}
            onClick={() => setSelectedSpanId(span.id)}
          />
        ))}
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
