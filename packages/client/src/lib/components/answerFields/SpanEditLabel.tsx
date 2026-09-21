import { useEffect } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import type { SpanAnnotationState } from "../../context/SpanAnnotationContext";
import { useCoderSettings } from "../../context/CoderSettingsContext";
import { getCodeBadgeStyle, getCodeButtonStyle } from "../../utils/color";
import { truncateSpanText } from "../SelectableText";
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
export function SpanEditLabel({
  annotation,
  span,
  onBack,
  onCancel,
  onCodeChanged,
  onDelete,
}: SpanEditLabelProps) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  function colorFor(code: string): string | undefined {
    return annotation.codes.find((c) => c.code === code)?.color;
  }

  const spanSummary = span.slices.map((s) => s.text).join(" ... ");

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      annotation.setPendingSpan(null);
      annotation.setFocusedSpanId(null);
    }
  };

  const handleCodeChange = (newCode: string) => {
    if (newCode === span.code) return;
    annotation.updateSpan(span.id, newCode);
    if (onCodeChanged) {
      onCodeChanged(newCode);
    } else {
      annotation.setPendingSpan(null);
      annotation.setFocusedSpanId(null);
    }
  };

  const handleDelete = () => {
    annotation.removeSpan(span.id);
    if (onDelete) {
      onDelete();
    } else {
      annotation.setPendingSpan(null);
      annotation.setFocusedSpanId(null);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= annotation.codes.length) {
        e.preventDefault();
        const newCode = annotation.codes[num - 1].code;
        handleCodeChange(newCode);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotation, span, onCancel, onCodeChanged, onDelete]);

  const badgeStyle = getCodeBadgeStyle(colorFor(span.code), isDark);

  return (
    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-1">
      {/* Header bar: back button, label badge + quoted text, and cancel icon */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0 mr-1"
              title="Back to labels"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </button>
          )}
          <span
            style={badgeStyle}
            className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold shrink-0"
          >
            {span.code}
          </span>
          <span
            className="text-xs sm:text-sm font-serif italic text-foreground truncate max-w-sm sm:max-w-md"
            title={spanSummary}
          >
            &ldquo;{truncateSpanText(spanSummary, 55)}&rdquo;
          </span>
          {span.slices.length > 1 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              {span.slices.length} frags
            </span>
          )}
        </div>

        {/* Clear cancel icon button */}
        <button
          type="button"
          onClick={handleCancel}
          className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
          title="Cancel (Esc)"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
          <ShortcutBadge shortcut="Esc" />
        </button>
      </div>

      {/* Action Row: Code buttons to change label + Delete button */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {annotation.codes.map((c, idx) => {
          const isCurrent = c.code === span.code;
          return (
            <button
              key={c.code}
              type="button"
              disabled={isCurrent}
              className={`relative flex flex-1 min-w-[95px] max-w-[180px] items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                isCurrent
                  ? "ring-2 ring-foreground/60 shadow-sm opacity-90 cursor-default"
                  : "hover:scale-105 active:scale-95"
              }`}
              style={getCodeButtonStyle(c.color, isCurrent, isDark)}
              onClick={() => handleCodeChange(c.code)}
              title={isCurrent ? `Currently assigned: ${c.code}` : `Change to ${c.code}`}
            >
              {idx < 9 && <ShortcutBadge shortcut={String(idx + 1)} />}
              <span className="truncate">{c.code}</span>
              {isCurrent && <Check className="h-3.5 w-3.5 ml-0.5 text-foreground shrink-0" />}
            </button>
          );
        })}

        {/* Delete label button */}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="relative h-8 px-3 text-xs gap-1.5 cursor-pointer ml-auto shrink-0 shadow-xs"
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
