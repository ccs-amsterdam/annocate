import { useEffect } from "react";
import { optionLabel, type SpanAnswer } from "@annotinder/contracts";
import { useCoderSettings } from "../../context/coderSettings";
import { useSpanAnnotation, type PendingSpan, type SpanAnnotationState } from "../../context/spanAnnotation";
import { isContinue } from "../../keyboard/commands";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope, useKeyTargets } from "../../keyboard/hooks";
import { SpanIdle } from "./SpanIdle";
import { SpanLabelPicker } from "./SpanLabelPicker";
import { SpanList } from "./SpanList";
import { SpanManageLabels } from "./SpanManageLabels";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type SpanVariable = Extract<QuestionVariable, { type: "span" }>;

/**
 * What the field shows: the spans on a clicked word (`manage`), the labels
 * for a new selection (`label`), the list of all the unit's spans (`list`),
 * or else how many are labelled, with Done (`idle`).
 */
type SpanFieldMode = "manage" | "label" | "list" | "idle";

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

  const pending = annotation?.pendingSpan ?? null;
  const manageSpans = annotation && pending ? spansToManage(annotation.spans, pending) : [];
  const mode = modeOf(annotation, manageSpans);
  const viewingList = annotation?.isViewingAllLabels ?? false;

  useCloseListOnSelection(annotation);
  const labelKeys = useSpanLabelKeys(annotation, mode === "label");
  const done = () => onAnswer({ done: true, skip: false, spans: annotation?.spans ?? [] });
  // Ctrl + Enter: Done, when nothing is being selected or edited
  useKeyScope(
    (press) => {
      if (!isContinue(press) || pending || viewingList) return false;
      done();
      return true;
    },
    true,
    { priority: PRIORITY.field },
  );

  return (
    <div className="flex flex-col gap-2.5">
      {mode === "manage" && annotation && pending && (
        <SpanManageLabels
          annotation={annotation}
          spans={manageSpans}
          initialTargetSpanId={pending.targetSpanId}
          fallbackSlices={pending.slices}
        />
      )}
      {mode === "label" && annotation && pending && (
        <SpanLabelPicker annotation={annotation} pending={pending} labelKeys={labelKeys} isDark={isDark} />
      )}
      {mode === "list" && annotation && (
        <SpanList annotation={annotation} isDark={isDark} onClose={() => closeList(annotation)} />
      )}
      {mode === "idle" && (
        <SpanIdle
          count={annotation?.spans.length ?? 0}
          onViewList={() => annotation?.setIsViewingAllLabels(true)}
          onDone={done}
        />
      )}
    </div>
  );
}

function modeOf(annotation: SpanAnnotationState | null, manageSpans: SpanAnswer[]): SpanFieldMode {
  const pending = annotation?.pendingSpan;
  if (pending) return pending.mode === "manage" || manageSpans.length > 0 ? "manage" : "label";
  return annotation?.isViewingAllLabels ? "list" : "idle";
}

/** A clicked span (or its word): the spans there, to manage. None for a new selection. */
function spansToManage(spans: SpanAnswer[], pending: PendingSpan): SpanAnswer[] {
  if (pending.mode !== "manage" && !pending.isEditingExisting && !pending.targetSpanId) return [];
  return spans.filter(
    (s) =>
      pending.existingSpanIds?.includes(s.id) ||
      (pending.targetSpanId && s.id === pending.targetSpanId) ||
      s.slices.some((sl) => pending.slices.some((ps) => ps.offset === sl.offset && ps.length === sl.length)),
  );
}

/** Closes the list of all spans, and the span opened from it. */
function closeList(annotation: SpanAnnotationState): void {
  annotation.setIsViewingAllLabels(false);
  annotation.setFocusedSpanId(null);
}

/** A new selection in the text closes the list. */
function useCloseListOnSelection(annotation: SpanAnnotationState | null): void {
  const pending = annotation?.pendingSpan;
  const setIsViewingAllLabels = annotation?.setIsViewingAllLabels;
  const setFocusedSpanId = annotation?.setFocusedSpanId;
  useEffect(() => {
    if (pending) {
      setIsViewingAllLabels?.(false);
      setFocusedSpanId?.(null);
    }
  }, [pending, setIsViewingAllLabels, setFocusedSpanId]);
}

/**
 * Creating a span (`labelling`): the shortcut style's keys choose its label
 * (as for an answer's options), Escape cancels. Returns each label's key.
 */
function useSpanLabelKeys(annotation: SpanAnnotationState | null, labelling: boolean): (string | null)[] {
  const targets = labelling && annotation ? [annotation.options.map((o) => ({ label: optionLabel(o) }))] : null;
  const { keys } = useKeyTargets(
    targets,
    (_, index) => {
      if (!annotation?.pendingSpan) return;
      annotation.addSpan(annotation.pendingSpan.slices, annotation.options[index].value);
      annotation.setPendingSpan(null);
    },
    { priority: PRIORITY.editor },
  );
  useKeyScope(
    (press) => {
      if (press.key !== "Escape" || !annotation?.pendingSpan) return false;
      annotation.setPendingSpan(null);
      return true;
    },
    labelling,
    { priority: PRIORITY.editor },
  );
  return keys[0] ?? [];
}
