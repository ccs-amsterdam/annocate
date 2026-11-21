import { optionLabel } from "@annotinder/contracts";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope } from "../../keyboard/hooks";
import { useCallback } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import type { SpanAnnotationState } from "../../context/spanAnnotation";
import { useCoderSettings } from "../../context/coderSettings";
import { getCodeBadgeStyle, getCodeButtonStyle } from "../../utils/color";
import { truncateSpanText } from "../spanText";
import { ShortcutBadge } from "../ShortcutBadge";
import { Button } from "@/components/ui/button";
import { Trash2, Check, ArrowLeft, X } from "lucide-react";

export interface SpanEditLabelProps {
  annotation: SpanAnnotationState;
  span: SpanAnswer;
  onBack?: () => void;
  onCancel?: () => void;
  onCodeChanged?: (newCode: string) => void;
  onDelete?: () => void;
}

/**
 * Component for deleting or changing an existing label.
 *
 * Displays:
 * 1. The label badge and the span text of this label, with back arrow and cancel icon.
 * 2. Code buttons to change the label (with absolute shortcut badges 1-9).
 * 3. Direct Delete button (with absolute Del shortcut badge).
 */
export function SpanEditLabel({ annotation, span, onBack, onCancel, onCodeChanged, onDelete }: SpanEditLabelProps) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  function colorFor(code: string): string | undefined {
    return annotation.options.find((c) => c.value === code)?.color;
  }

  function labelFor(value: string): string {
    const option = annotation.options.find((c) => c.value === value);
    return option ? optionLabel(option) : value;
  }

  const spanSummary = span.slices.map((s) => s.text).join(" ... ");

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      annotation.setPendingSpan(null);
      annotation.setFocusedSpanId(null);
    }
  }, [annotation, onCancel]);

  const handleCodeChange = useCallback(
    (newCode: string) => {
      if (newCode === span.value) return;
      annotation.updateSpan(span.id, newCode);
      if (onCodeChanged) {
        onCodeChanged(newCode);
      } else {
        annotation.setPendingSpan(null);
        annotation.setFocusedSpanId(null);
      }
    },
    [annotation, span, onCodeChanged],
  );

  const handleDelete = useCallback(() => {
    annotation.removeSpan(span.id);
    if (onDelete) {
      onDelete();
    } else {
      annotation.setPendingSpan(null);
      annotation.setFocusedSpanId(null);
    }
  }, [annotation, span, onDelete]);

  // Editing a span: number keys change its label, Delete/Backspace removes it, Escape cancels
  useKeyScope(
    (press) => {
      if (press.key === "Escape") {
        handleCancel();
        return true;
      }
      if (press.key === "Delete" || press.key === "Backspace") {
        handleDelete();
        return true;
      }
      const num = parseInt(press.key, 10);
      if (isNaN(num) || num < 1 || num > annotation.options.length) return false;
      handleCodeChange(annotation.options[num - 1].value);
      return true;
    },
    true,
    { priority: PRIORITY.menu },
  );

  const badgeStyle = getCodeBadgeStyle(colorFor(span.value), isDark);

  return (
    <div className="flex animate-in flex-col gap-2 fade-in slide-in-from-bottom-1">
      {/* Header bar: back button, label badge + quoted text, and cancel icon */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mr-1 flex shrink-0 cursor-pointer items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              title="Back to labels"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </button>
          )}
          <span
            style={badgeStyle}
            className="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
          >
            {labelFor(span.value)}
          </span>
          <span
            className="max-w-sm truncate font-serif text-xs text-foreground italic sm:max-w-md sm:text-sm"
            title={spanSummary}
          >
            &ldquo;{truncateSpanText(spanSummary, 55)}&rdquo;
          </span>
          {span.slices.length > 1 && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {span.slices.length} frags
            </span>
          )}
        </div>

        {/* Clear cancel icon button */}
        <button
          type="button"
          onClick={handleCancel}
          className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          title="Cancel (Esc)"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
          <ShortcutBadge shortcut="Esc" />
        </button>
      </div>

      {/* Action Row: Code buttons to change label + Delete button */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {annotation.options.map((c, idx) => {
          const isCurrent = c.value === span.value;
          return (
            <button
              key={c.value}
              type="button"
              disabled={isCurrent}
              className={`relative flex max-w-[180px] min-w-[95px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-xs transition-all ${
                isCurrent
                  ? "cursor-default opacity-90 shadow-sm ring-2 ring-foreground/60"
                  : "hover:scale-105 active:scale-95"
              }`}
              style={getCodeButtonStyle(c.color, isCurrent, isDark)}
              onClick={() => handleCodeChange(c.value)}
              title={isCurrent ? `Currently assigned: ${optionLabel(c)}` : `Change to ${optionLabel(c)}`}
            >
              {idx < 9 && <ShortcutBadge shortcut={String(idx + 1)} />}
              <span className="truncate">{optionLabel(c)}</span>
              {isCurrent && <Check className="ml-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />}
            </button>
          );
        })}

        {/* Delete label button */}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="relative ml-auto h-8 shrink-0 cursor-pointer gap-1.5 px-3 text-xs shadow-xs"
          onClick={handleDelete}
          title="Delete this label (Del / Backspace)"
        >
          <ShortcutBadge shortcut="Del" />
          <Trash2 className="h-3.5 w-3.5" />
          <span>Delete</span>
        </Button>
      </div>
    </div>
  );
}
