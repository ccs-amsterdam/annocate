import { optionLabel } from "@annotinder/contracts";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope, useKeyTargets } from "../../keyboard/hooks";
import { useCallback } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import type { SpanAnnotationState } from "../../context/spanAnnotation";
import { useCoderSettings } from "../../context/coderSettings";
import { getCodeBadgeStyle, getCodeButtonStyle } from "../../utils/color";
import { optionColor, optionLabelOf, spanSummary, truncateSpanText } from "../spanText";
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
 * Changing or deleting a span's label: the span (label and text), a button
 * per label (keys 1-9) and Delete (Del or Backspace). Without the callbacks,
 * each action closes the editor (clears the pending selection and focus).
 */
export function SpanEditLabel({ annotation, span, onBack, onCancel, onCodeChanged, onDelete }: SpanEditLabelProps) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  const summary = spanSummary(span.slices);

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

  // Editing a span: the shortcut style's keys change its label, Delete/Backspace removes it, Escape cancels
  const labelKeys =
    useKeyTargets(
      [annotation.options.map((o) => ({ label: optionLabel(o) }))],
      (_, index) => handleCodeChange(annotation.options[index].value),
      { priority: PRIORITY.menu },
    ).keys[0] ?? [];
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
      return false;
    },
    true,
    { priority: PRIORITY.menu },
  );

  const badgeStyle = getCodeBadgeStyle(optionColor(annotation.options, span.value), isDark);

  return (
    <div className="flex animate-in flex-col gap-2 fade-in slide-in-from-bottom-1">
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
            {optionLabelOf(annotation.options, span.value)}
          </span>
          <span
            className="max-w-sm truncate font-serif text-xs text-foreground italic sm:max-w-md sm:text-sm"
            title={summary}
          >
            &ldquo;{truncateSpanText(summary, 55)}&rdquo;
          </span>
          {span.slices.length > 1 && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {span.slices.length} frags
            </span>
          )}
        </div>

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
              {labelKeys[idx] && <ShortcutBadge shortcut={labelKeys[idx]!} />}
              <span className="truncate">{optionLabel(c)}</span>
              {isCurrent && <Check className="ml-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />}
            </button>
          );
        })}

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
