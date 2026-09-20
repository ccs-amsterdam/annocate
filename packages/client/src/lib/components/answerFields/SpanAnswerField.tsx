import { useState, useEffect } from "react";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import type { SpanAnswer } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { useSpanAnnotation } from "../../context/SpanAnnotationContext";
import { useCoderSettings } from "../../context/CoderSettingsContext";
import { getCodeBadgeStyle, getCodeButtonStyle } from "../../utils/color";
import { truncateSpanText } from "../SelectableText";
import { ShortcutBadge } from "../ShortcutBadge";
import { Sparkles, X, ArrowLeft, ChevronRight, ListFilter } from "lucide-react";
import { SpanManageLabels } from "./SpanManageLabels";
import { SpanEditLabel } from "./SpanEditLabel";

type SpanVariable = Extract<QuestionVariable, { type: "span" }>;

/**
 * Answer field for `span` unit_variables (design plan §11a/§11b).
 *
 * Clearly separates:
 * 1. Label Creation (triggered when coder selects text in document):
 *    Shows quoted text and 1-9 code buttons flexing across rows;
 *    picking a code immediately assigns the span and closes.
 * 2. Label Inspection & Modification (triggered by clicking an existing label in document):
 *    Shows menu of current labels on this text and "Create new label" button.
 *    Clicking a label navigates to `SpanEditLabel` to change or delete it.
 * 3. Normal Idle Overview:
 *    Compact answer form with helper prompt, button to view the list of all labels,
 *    and Done completion button.
 * 4. Full Labels List (opened on demand via button):
 *    Replaces the answer form to review, change, or delete any labeled span in the unit.
 */
export function SpanAnswerField({ onAnswer }: AnswerFieldProps<SpanVariable>) {
  const annotation = useSpanAnnotation();
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  // State to show the full list of all labels in place of the normal answer form
  const [viewingAllLabels, setViewingAllLabels] = useState(false);
  const [editingSpanFromList, setEditingSpanFromList] = useState<SpanAnswer | null>(null);

  function colorFor(code: string): string | undefined {
    return annotation?.codes.find((c) => c.code === code)?.color;
  }

  const pending = annotation?.pendingSpan;

  // Resolve spans for manage mode
  const manageSpans =
    annotation && pending && (pending.mode === "manage" || pending.isEditingExisting || pending.targetSpanId)
      ? annotation.spans.filter(
          (s) =>
            pending.existingSpanIds?.includes(s.id) ||
            (pending.targetSpanId && s.id === pending.targetSpanId) ||
            (s.offset === pending.offset && s.length === pending.length),
        )
      : [];

  const isManageMode = Boolean(pending && (pending.mode === "manage" || manageSpans.length > 0));

  // Reset list views if a new span is selected in document
  useEffect(() => {
    if (pending) {
      setViewingAllLabels(false);
      setEditingSpanFromList(null);
    }
  }, [pending]);

  // Keyboard navigation for Creation mode (hotkeys 1-9 and Escape)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!annotation || !annotation.pendingSpan || isManageMode) return;

      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "Escape") {
        e.preventDefault();
        annotation.setPendingSpan(null);
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= annotation.codes.length) {
        e.preventDefault();
        const code = annotation.codes[num - 1].code;
        annotation.addSpan(
          annotation.pendingSpan.offset,
          annotation.pendingSpan.length,
          code,
          annotation.pendingSpan.text,
        );
        annotation.setPendingSpan(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotation, isManageMode]);

  return (
    <div className="flex flex-col gap-2.5">
      {pending ? (
        isManageMode && annotation ? (
          /* Separate Dedicated Form: Menu of existing labels on this word + "Create new label" */
          <SpanManageLabels
            annotation={annotation}
            spans={manageSpans}
            initialTargetSpanId={pending.targetSpanId}
            wordRange={
              pending.text
                ? { offset: pending.offset, length: pending.length, text: pending.text }
                : undefined
            }
          />
        ) : (
          /* Separate Dedicated Form: Create new label for selected text */
          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-1">
            {/* Header: selected text directly with quote and cancel icon button */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                <span
                  className="text-xs sm:text-sm font-serif font-medium italic text-foreground truncate max-w-sm sm:max-w-lg"
                  title={pending.text}
                >
                  &ldquo;{truncateSpanText(pending.text, 60)}&rdquo;
                </span>
              </div>

              {/* Clear cancel icon button */}
              <button
                type="button"
                onClick={() => annotation?.setPendingSpan(null)}
                className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
                title="Cancel (Esc)"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
                <ShortcutBadge shortcut="Esc" />
              </button>
            </div>

            {/* Code choices flexing to fill the row without trailing blank space */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {annotation?.codes.map((c, idx) => (
                <button
                  key={c.code}
                  type="button"
                  className="relative flex flex-1 min-w-[95px] max-w-[180px] items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs"
                  style={getCodeButtonStyle(c.color, false, isDark)}
                  onClick={() => {
                    annotation.addSpan(pending.offset, pending.length, c.code, pending.text);
                    annotation.setPendingSpan(null);
                  }}
                >
                  {idx < 9 && <ShortcutBadge shortcut={String(idx + 1)} />}
                  <span className="truncate">{c.code}</span>
                </button>
              ))}
            </div>
          </div>
        )
      ) : viewingAllLabels && annotation ? (
        /* Full list of all labels in place of the normal answer form */
        <div className="flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-1">
          {editingSpanFromList ? (
            <SpanEditLabel
              annotation={annotation}
              span={editingSpanFromList}
              onBack={() => setEditingSpanFromList(null)}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => {
                      setViewingAllLabels(false);
                      setEditingSpanFromList(null);
                    }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </Button>
                  <span className="text-xs font-semibold text-foreground">
                    All labeled spans ({annotation.spans.length}):
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setViewingAllLabels(false);
                    setEditingSpanFromList(null);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
                  title="Close list"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[140px] pr-0.5">
                {annotation.spans.map((span) => {
                  const badgeStyle = getCodeBadgeStyle(colorFor(span.code), isDark);
                  return (
                    <button
                      key={span.id}
                      type="button"
                      onClick={() => setEditingSpanFromList(span)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-1.5 text-left hover:bg-muted/60 hover:border-primary/40 transition-all cursor-pointer shadow-2xs group"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          style={badgeStyle}
                          className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold shrink-0"
                        >
                          {span.code}
                        </span>
                        <span
                          className="text-xs font-serif italic text-foreground/90 truncate"
                          title={span.text}
                        >
                          &ldquo;{truncateSpanText(span.text, 55)}&rdquo;
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                        <span>Edit</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Normal Idle Overview: Compact prompt + View all labels button + Done button */
        <div className="flex flex-col gap-3 py-0.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Click or select words above to label spans.
            </p>
            <span className="text-xs font-mono font-medium text-muted-foreground">
              {annotation?.spans.length ?? 0} labeled
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5 cursor-pointer"
              disabled={!annotation || annotation.spans.length === 0}
              onClick={() => setViewingAllLabels(true)}
              title={
                !annotation || annotation.spans.length === 0
                  ? "No spans labeled yet"
                  : "View and edit all labeled spans"
              }
            >
              <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
              <span>View labeled spans ({annotation?.spans.length ?? 0})</span>
            </Button>

            {/* Bottom Completion Action */}
            <Button
              size="sm"
              onClick={() =>
                onAnswer({ done: true, skip: false, spans: annotation?.spans ?? [] })
              }
            >
              Done ({annotation?.spans.length ?? 0})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
