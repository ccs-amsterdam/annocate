import { useState, useEffect } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { useSpanAnnotation } from "../../context/SpanAnnotationContext";
import { useCoderSettings } from "../../context/CoderSettingsContext";
import { getCodeBadgeStyle, getCodeButtonStyle } from "../../utils/color";
import { truncateSpanText } from "../SelectableText";
import { ShortcutBadge } from "../ShortcutBadge";
import { SpanManageLabels } from "./SpanManageLabels";
import { SpanEditLabel } from "./SpanEditLabel";
import { X, ArrowLeft, ChevronRight, List } from "lucide-react";

type SpanVariable = Extract<QuestionVariable, { type: "span" }>;

/**
 * Answer field for `span` unit_variables (design plan §11b):
 * Coordinates the ambient span annotation state with the question flow.
 *
 * Requirements implemented:
 * 1. Default view: Clean, compact summary + "View labeled spans" button + "Done" button.
 * 2. Compact height: Scrollable overflow container preventing layout inflation.
 * 3. Dedicated Manage Mode: Clicking an existing label in text opens `SpanManageLabels`.
 * 4. Inline Creation Bar: Making a new text selection opens direct code assignment buttons (1-9).
 * 5. Full Label List View (when clicking "View labeled spans"):
 *    Replaces the answer form to review, change, or delete any labeled span in the unit.
 */
export function SpanAnswerField({ onAnswer }: AnswerFieldProps<SpanVariable>) {
  const annotation = useSpanAnnotation();
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  // State to show the full list of all labels in place of the normal answer form
  const viewingAllLabels = annotation?.isViewingAllLabels ?? false;
  const setViewingAllLabels = (viewing: boolean) => {
    annotation?.setIsViewingAllLabels(viewing);
    if (!viewing) {
      setEditingSpanFromList(null);
      annotation?.setFocusedSpanId(null);
    }
  };

  const [editingSpanFromList, setEditingSpanFromList] = useState<SpanAnswer | null>(null);

  const handleSelectSpanFromList = (span: SpanAnswer) => {
    setEditingSpanFromList(span);
    annotation?.setFocusedSpanId(span.id);
  };

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
            s.slices.some((sl) =>
              pending.slices.some((ps) => ps.offset === sl.offset && ps.length === sl.length),
            ),
        )
      : [];

  const isManageMode = Boolean(pending && (pending.mode === "manage" || manageSpans.length > 0));

  // Reset list views if a new span is selected in document
  useEffect(() => {
    if (pending) {
      setViewingAllLabels(false);
      setEditingSpanFromList(null);
      annotation?.setFocusedSpanId(null);
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
        annotation.addSpan(annotation.pendingSpan.slices, code);
        annotation.setPendingSpan(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotation, isManageMode]);

  const pendingTextSummary = pending?.slices.map((s) => s.text).join(" ... ") ?? "";

  return (
    <div className="flex flex-col gap-2.5">
      {pending ? (
        isManageMode && annotation ? (
          /* Separate Dedicated Form: Menu of existing labels on this word + "Create new label" */
          <SpanManageLabels
            annotation={annotation}
            spans={manageSpans}
            initialTargetSpanId={pending.targetSpanId}
            fallbackSlices={pending.slices}
          />
        ) : (
          /* Inline Creation Mode: Assign code to new text selection */
          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xs font-semibold text-foreground shrink-0">Label as:</span>
                <span
                  className="text-xs sm:text-sm font-serif italic text-muted-foreground truncate max-w-sm sm:max-w-md"
                  title={pendingTextSummary}
                >
                  &ldquo;{truncateSpanText(pendingTextSummary, 55)}&rdquo;
                </span>
                {pending.slices.length > 1 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                    {pending.slices.length} frags
                  </span>
                )}
                {annotation?.allowGaps && (
                  <span className="text-[10px] text-muted-foreground italic shrink-0 hidden sm:inline">
                    (tap words to toggle gaps)
                  </span>
                )}
              </div>

              {/* Clear pending selection */}
              <button
                type="button"
                onClick={() => annotation?.setPendingSpan(null)}
                className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
                title="Cancel selection (Esc)"
                aria-label="Cancel selection"
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
                    annotation.addSpan(pending.slices, c.code);
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
              onBack={() => {
                setEditingSpanFromList(null);
                annotation.setFocusedSpanId(null);
              }}
              onCancel={() => {
                setEditingSpanFromList(null);
                setViewingAllLabels(false);
                annotation.setFocusedSpanId(null);
              }}
              onCodeChanged={() => {
                setEditingSpanFromList(null);
                annotation.setFocusedSpanId(null);
              }}
              onDelete={() => {
                setEditingSpanFromList(null);
                annotation.setFocusedSpanId(null);
              }}
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
                      annotation.setFocusedSpanId(null);
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
                    annotation.setFocusedSpanId(null);
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
                  const spanSummary = span.slices.map((sl) => sl.text).join(" ... ");
                  return (
                    <button
                      key={span.id}
                      type="button"
                      onClick={() => handleSelectSpanFromList(span)}
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
                          title={spanSummary}
                        >
                          &ldquo;{truncateSpanText(spanSummary, 55)}&rdquo;
                        </span>
                        {span.slices.length > 1 && (
                          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground shrink-0">
                            {span.slices.length} frags
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

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5 cursor-pointer"
              disabled={!annotation || annotation.spans.length === 0}
              onClick={() => setViewingAllLabels(true)}
              title={
                annotation && annotation.spans.length > 0
                  ? "View and edit all labeled spans"
                  : "No spans labeled yet"
              }
            >
              <List className="h-3.5 w-3.5" />
              <span>View labeled spans ({annotation?.spans.length ?? 0})</span>
            </Button>

            <Button
              size="sm"
              className="h-8 px-4 text-xs font-medium cursor-pointer"
              onClick={() =>
                onAnswer({
                  done: true,
                  skip: false,
                  spans: annotation?.spans ?? [],
                })
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
