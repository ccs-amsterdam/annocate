import { optionLabel } from "@annotinder/contracts";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope } from "../../keyboard/hooks";
import { useState, useEffect } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { useSpanAnnotation } from "../../context/spanAnnotation";
import { useCoderSettings } from "../../context/coderSettings";
import { getCodeButtonStyle } from "../../utils/color";
import { spanSummary, truncateSpanText } from "../spanText";
import { ShortcutBadge } from "../ShortcutBadge";
import { SpanManageLabels } from "./SpanManageLabels";
import { SpanEditLabel } from "./SpanEditLabel";
import { SpanListRow } from "./SpanListRow";
import { X, ArrowLeft, List } from "lucide-react";

type SpanVariable = Extract<QuestionVariable, { type: "span" }>;

/**
 * The answer field of a `span` question (docs/client.md §4 "Span and
 * relation answers"). The coder selects text in the unit (`SelectableText`);
 * this field shows, by turn: the labels for a new selection (keys 1-9), the
 * spans on a clicked word (`SpanManageLabels`), the list of all the unit's
 * spans to edit, or else how many are labelled with Done.
 */
export function SpanAnswerField({ onAnswer }: AnswerFieldProps<SpanVariable>) {
  const annotation = useSpanAnnotation();
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";

  // The list of all spans, shown instead of the answer form, and the span opened from it
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
  /** Back from editing a span to the list. */
  const closeSpanEditor = () => {
    setEditingSpanFromList(null);
    annotation?.setFocusedSpanId(null);
  };

  const pending = annotation?.pendingSpan;

  // A clicked span (or its word): the spans there, to manage
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

  // A new selection in the text closes the list
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

  const pendingTextSummary = pending ? spanSummary(pending.slices) : "";

  return (
    <div className="flex flex-col gap-2.5">
      {pending ? (
        isManageMode && annotation ? (
          <SpanManageLabels
            annotation={annotation}
            spans={manageSpans}
            initialTargetSpanId={pending.targetSpanId}
            fallbackSlices={pending.slices}
          />
        ) : (
          /* A new selection: pick its label */
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

            {/* In a wide coding area the labels are at the selection (SpanLabelMenu); narrower, here, near the thumbs */}
            <p className="hidden text-xs text-muted-foreground @2xl:block">
              Pick a label at the selection
              {annotation && annotation.options.length > 1
                ? `, or press 1 to ${Math.min(9, annotation.options.length)}`
                : ""}
              .
            </p>
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
        /* All the unit's spans, to edit one */
        <div className="flex animate-in flex-col gap-2.5 fade-in slide-in-from-bottom-1">
          {editingSpanFromList ? (
            <SpanEditLabel
              annotation={annotation}
              span={editingSpanFromList}
              onBack={closeSpanEditor}
              onCancel={() => setViewingAllLabels(false)}
              onCodeChanged={closeSpanEditor}
              onDelete={closeSpanEditor}
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
                    onClick={() => setViewingAllLabels(false)}
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
                  onClick={() => setViewingAllLabels(false)}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  title="Close list"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex max-h-[140px] flex-col gap-1.5 overflow-y-auto pr-0.5">
                {annotation.spans.map((span) => (
                  <SpanListRow
                    key={span.id}
                    span={span}
                    options={annotation.options}
                    isDark={isDark}
                    variant="list"
                    onClick={() => handleSelectSpanFromList(span)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Nothing selected: how many spans, the list, and Done */
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
