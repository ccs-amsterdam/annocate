import { optionLabel } from "@annotinder/contracts";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope } from "../../keyboard/hooks";
import { useState, useEffect } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { useSpanAnnotation } from "../../context/spanAnnotation";
import { useCoderSettings } from "../../context/coderSettings";
import { getCodeBadgeStyle, getCodeButtonStyle } from "../../utils/color";
import { truncateSpanText } from "../spanText";
import { ShortcutBadge } from "../ShortcutBadge";
import { SpanManageLabels } from "./SpanManageLabels";
import { SpanEditLabel } from "./SpanEditLabel";
import { X, ArrowLeft, ChevronRight, List } from "lucide-react";

type SpanVariable = Extract<QuestionVariable, { type: "span" }>;

/**
 * Answer field for `span` questions (docs/client.md §4):
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
    return annotation?.options.find((c) => c.value === code)?.color;
  }

  function labelFor(value: string): string {
    const option = annotation?.options.find((c) => c.value === value);
    return option ? optionLabel(option) : value;
  }

  const pending = annotation?.pendingSpan;

  // Resolve spans for manage mode
  const manageSpans =
    annotation && pending && (pending.mode === "manage" || pending.isEditingExisting || pending.targetSpanId)
      ? annotation.spans.filter(
          (s) =>
            pending.existingSpanIds?.includes(s.id) ||
            (pending.targetSpanId && s.id === pending.targetSpanId) ||
            s.slices.some((sl) => pending.slices.some((ps) => ps.offset === sl.offset && ps.length === sl.length)),
        )
      : [];

  const isManageMode = Boolean(pending && (pending.mode === "manage" || manageSpans.length > 0));

  // Reset list views if a new span is selected in document
  const setIsViewingAllLabels = annotation?.setIsViewingAllLabels;
  const setFocusedSpanId = annotation?.setFocusedSpanId;
  useEffect(() => {
    if (pending) {
      setIsViewingAllLabels?.(false);
      setEditingSpanFromList(null);
      setFocusedSpanId?.(null);
    }
  }, [pending, setIsViewingAllLabels, setFocusedSpanId]);

  // Creating a span: number keys choose its label, Escape cancels
  useKeyScope(
    (press) => {
      if (!annotation?.pendingSpan) return false;
      if (press.key === "Escape") {
        annotation.setPendingSpan(null);
        return true;
      }
      const num = parseInt(press.key, 10);
      if (isNaN(num) || num < 1 || num > annotation.options.length) return false;
      annotation.addSpan(annotation.pendingSpan.slices, annotation.options[num - 1].value);
      annotation.setPendingSpan(null);
      return true;
    },
    !!annotation?.pendingSpan && !isManageMode,
    { priority: PRIORITY.editor },
  );

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
          <div className="flex animate-in flex-col gap-2 fade-in slide-in-from-bottom-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-foreground">Label as:</span>
                <span
                  className="max-w-sm truncate font-serif text-xs text-muted-foreground italic sm:max-w-md sm:text-sm"
                  title={pendingTextSummary}
                >
                  &ldquo;{truncateSpanText(pendingTextSummary, 55)}&rdquo;
                </span>
                {pending.slices.length > 1 && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {pending.slices.length} frags
                  </span>
                )}
                {annotation?.allowGaps && (
                  <span className="hidden shrink-0 text-[10px] text-muted-foreground italic sm:inline">
                    (tap words to toggle gaps)
                  </span>
                )}
              </div>

              {/* Clear pending selection */}
              <button
                type="button"
                onClick={() => annotation?.setPendingSpan(null)}
                className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                title="Cancel selection (Esc)"
                aria-label="Cancel selection"
              >
                <X className="h-4 w-4" />
                <ShortcutBadge shortcut="Esc" />
              </button>
            </div>

            {/* From sm up the labels are at the selection (SpanLabelMenu); on a phone here, near the thumbs */}
            <p className="hidden text-xs text-muted-foreground @2xl:block">
              Pick a label at the selection
              {annotation && annotation.options.length > 1
                ? `, or press 1 to ${Math.min(9, annotation.options.length)}`
                : ""}
              .
            </p>
            {/* Code choices flexing to fill the row without trailing blank space */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5 @2xl:hidden">
              {annotation?.options.map((c, idx) => (
                <button
                  key={c.value}
                  type="button"
                  className="relative flex max-w-[180px] min-w-[95px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-xs transition-all hover:scale-105 active:scale-95"
                  style={getCodeButtonStyle(c.color, false, isDark)}
                  onClick={() => {
                    annotation.addSpan(pending.slices, c.value);
                    annotation.setPendingSpan(null);
                  }}
                >
                  {idx < 9 && <ShortcutBadge shortcut={String(idx + 1)} />}
                  <span className="truncate">{optionLabel(c)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      ) : viewingAllLabels && annotation ? (
        /* Full list of all labels in place of the normal answer form */
        <div className="flex animate-in flex-col gap-2.5 fade-in slide-in-from-bottom-1">
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
                    className="h-7 cursor-pointer gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
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
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  title="Close list"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex max-h-[140px] flex-col gap-1.5 overflow-y-auto pr-0.5">
                {annotation.spans.map((span) => {
                  const badgeStyle = getCodeBadgeStyle(colorFor(span.value), isDark);
                  const spanSummary = span.slices.map((sl) => sl.text).join(" ... ");
                  return (
                    <button
                      key={span.id}
                      type="button"
                      onClick={() => handleSelectSpanFromList(span)}
                      className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-1.5 text-left shadow-2xs transition-all hover:border-primary/40 hover:bg-muted/60"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span
                          style={badgeStyle}
                          className="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
                        >
                          {labelFor(span.value)}
                        </span>
                        <span className="truncate font-serif text-xs text-foreground/90 italic" title={spanSummary}>
                          &ldquo;{truncateSpanText(spanSummary, 55)}&rdquo;
                        </span>
                        {span.slices.length > 1 && (
                          <span className="py-0.2 shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                            {span.slices.length} frags
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
            </>
          )}
        </div>
      ) : (
        /* Normal Idle Overview: Compact prompt + View all labels button + Done button */
        <div className="flex flex-col gap-3 py-0.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Click or select words above to label spans.</p>
            <span className="font-mono text-xs font-medium text-muted-foreground">
              {annotation?.spans.length ?? 0} labeled
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 cursor-pointer gap-1.5 px-3 text-xs"
              disabled={!annotation || annotation.spans.length === 0}
              onClick={() => setViewingAllLabels(true)}
              title={
                annotation && annotation.spans.length > 0 ? "View and edit all labeled spans" : "No spans labeled yet"
              }
            >
              <List className="h-3.5 w-3.5" />
              <span>View labeled spans ({annotation?.spans.length ?? 0})</span>
            </Button>

            <Button
              size="sm"
              className="h-8 cursor-pointer px-4 text-xs font-medium"
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
