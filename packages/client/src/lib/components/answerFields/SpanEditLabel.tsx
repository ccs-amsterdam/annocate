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
}

/**
 * Component for deleting or changing an existing label.
 *
 * Displays:
 * 1. The label badge and the span text of this label, with back arrow and cancel icon.
 * 2. Code buttons to change the label (with absolute shortcut badges 1-9).
 * 3. Direct Delete button (with absolute Del shortcut badge).
 */
export function SpanEditLabel({ annotation, span, onBack }: SpanEditLabelProps) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  function colorFor(code: string): string | undefined {
    return annotation.codes.find((c) => c.code === code)?.color;
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "Escape") {
        e.preventDefault();
        annotation.setPendingSpan(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        annotation.removeSpan(span.id);
        annotation.setPendingSpan(null);
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= annotation.codes.length) {
        e.preventDefault();
        const newCode = annotation.codes[num - 1].code;
        if (newCode !== span.code) {
          annotation.removeSpan(span.id);
          annotation.addSpan(span.offset, span.length, newCode, span.text);
        }
        annotation.setPendingSpan(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotation, span]);

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
            title={span.text}
          >
            &ldquo;{truncateSpanText(span.text, 55)}&rdquo;
          </span>
        </div>

        {/* Clear cancel icon button */}
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
              onClick={() => {
                if (isCurrent) return;
                annotation.removeSpan(span.id);
                annotation.addSpan(span.offset, span.length, c.code, span.text);
                annotation.setPendingSpan(null);
              }}
              title={isCurrent ? `Currently assigned: ${c.code}` : `Change to ${c.code}`}
            >
              {idx < 9 && <ShortcutBadge shortcut={String(idx + 1)} />}
              <span className="truncate">{c.code}</span>
              {isCurrent && <Check className="h-3.5 w-3.5 ml-0.5 text-foreground shrink-0" />}
            </button>
          );
        })}

        {/* Delete button */}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="relative flex flex-1 min-w-[85px] max-w-[120px] items-center justify-center h-8 px-2 text-xs cursor-pointer gap-1.5 shadow-xs"
          onClick={() => {
            annotation.removeSpan(span.id);
            annotation.setPendingSpan(null);
          }}
          title="Delete this label (Delete / Backspace)"
        >
          <ShortcutBadge shortcut="Del" />
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span>Delete</span>
        </Button>
      </div>
    </div>
  );
}
