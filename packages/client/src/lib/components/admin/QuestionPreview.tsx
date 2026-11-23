import { useState, type ReactNode } from "react";
import {
  itemName,
  type AnyVariableType,
  type DesignItem,
  type UnitData,
  type UnitLayout,
  type UnitLoopItem,
  type VariableValue,
} from "@annotinder/contracts";
import { type TemplateProgress } from "../../codebook/renderTemplate";
import { useRenderedLayout } from "./renderedLayout";
import { describeCondition } from "../../codebook/conditions";
import { Question } from "../Question";
import { UnitFields } from "../UnitFields";
import { SpanAnnotationProvider } from "../../context/SpanAnnotationContext";
import { Smartphone } from "lucide-react";
import { spanColumns } from "../../codebook/tree";

const MOCK_UNIT_DATA: UnitData = {
  headline: "Sample Headline: Global Climate Summit Reaches Historic Agreement",
  text: "World leaders concluded negotiations late Sunday evening, pledging to reduce carbon emissions significantly over the next decade. Delegations praised the collaborative effort.",
  body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum vestibulum. Cras venenatis euismod malesuada.",
  author: "Dr. Elena Rostova",
  category: "Environment",
  image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80",
};

interface QuestionPreviewProps {
  item: DesignItem;
  /** In a loop: the layout the unit is shown with (layoutItems.ts); null: the question without the unit. */
  layout: UnitLayout | null;
  parentLoop?: Extract<DesignItem, { type: "unit_loop" }> | null;
  /** The unit to show (default: a made-up one). */
  unitData?: UnitData;
  /** Answers to use in the layout's references and blocks, with the questions they answer. */
  questions?: ReadonlyMap<string, AnyVariableType>;
  answers?: Record<string, VariableValue>;
  /** The question on screen, for `::: from` blocks. */
  progress?: TemplateProgress;
  /** Shown under the header (ItemPreview: unit, question on screen, answers). */
  controls?: ReactNode;
}

/**
 * A live preview of a design item as coders see it (in a loop with its
 * unit), following every edit; the question can be answered.
 */
export function QuestionPreview({
  item,
  layout,
  parentLoop,
  unitData = MOCK_UNIT_DATA,
  questions,
  answers,
  progress,
  controls,
}: QuestionPreviewProps) {
  const [answerState, setAnswerState] = useState<{ value: VariableValue } | null>(null);

  const isVariable = item.type === "question";
  const isExperiment = item.type === "experiment";
  const isLoop = item.type === "unit_loop";
  const isCondition = item.type === "block";
  const isLayout = item.type === "layout";
  // The unit shows in a loop, with the layout that applies (none: the question alone)
  const showsUnit = layout !== null && (isLoop || isLayout || (isVariable && !!parentLoop));

  const spanVariable = isVariable && showsUnit && item.variable.type === "span" ? item.variable : null;

  const loop: UnitLoopItem | undefined = isLoop ? item : (parentLoop ?? undefined);
  // Span questions' fields are selectable during every question, as while coding.
  const selectable = loop ? spanColumns(loop) : (spanVariable?.fields ?? []);
  const rendered = useRenderedLayout(layout ?? { template: "" }, unitData, questions, answers, progress, selectable);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-3.5 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5 text-primary" />
          <span>Preview</span>
        </div>
        {answerState && (
          <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-medium text-primary">
            Answered: {JSON.stringify(answerState.value)}
          </span>
        )}
      </div>

      {controls}

      {/* The coding screen */}
      <div className="flex-1 overflow-y-auto bg-background/50 p-4">
        <div className="mx-auto flex max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md">
          {/* The unit (in a loop, with a layout) */}
          {showsUnit && layout && (
            <div className="border-b border-border/60 bg-background p-4 text-sm">
              {spanVariable ? (
                <SpanAnnotationProvider
                  key={itemName(item)}
                  fields={spanVariable.fields}
                  options={spanVariable.options}
                  defaultSelectionMode={spanVariable.selectionMode ?? "word"}
                  allowGaps={spanVariable.gaps ?? false}
                  initialSpans={[]}
                >
                  <UnitFields layout={layout} rendered={rendered} />
                </SpanAnnotationProvider>
              ) : (
                <UnitFields layout={layout} rendered={rendered} />
              )}
            </div>
          )}

          {isVariable && (
            <div className="bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                  Question Card ({item.variable.type})
                </span>
                {answerState && (
                  <button
                    type="button"
                    onClick={() => setAnswerState(null)}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Reset answer
                  </button>
                )}
              </div>
              <Question
                key={`${item.name}-${JSON.stringify(item.variable)}`}
                item={item}
                onAnswer={(value) => setAnswerState({ value })}
              />
            </div>
          )}

          {/* Experiments are drawn, never asked */}
          {isExperiment && (
            <div className="p-4 text-sm">
              <span className="text-xs font-semibold text-primary">Experiment</span>
              <p className="mt-1 text-xs text-muted-foreground">
                Coders never see this item. The server draws its value when a coder reaches it; use it as
                <code className="mx-1 rounded bg-muted px-1 font-mono">$var.{item.name}</code> in conditions and texts.
              </p>
            </div>
          )}

          {isLayout && (
            <div className="p-4 text-xs text-muted-foreground">
              The questions after this layout show the unit like this, until the next layout.
            </div>
          )}

          {isCondition && (
            <div className="p-4 text-sm">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Condition Item</span>
              <p className="mt-1 text-xs text-muted-foreground">
                Shown when:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{describeCondition(item.condition)}</code>
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Condition items do not display a visible card to coders; their rules or script decide which items are
                shown.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
