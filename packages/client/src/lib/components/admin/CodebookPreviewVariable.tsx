import { useEffect, useState, type ReactNode } from "react";
import {
  buildScope,
  itemName,
  type AnyVariableType,
  type CodebookItem,
  type UnitData,
  type UnitLayout,
  type VariableValue,
} from "@annotinder/contracts";
import { renderTemplate, type RenderedTemplate, type TemplateProgress } from "../../codebook/renderTemplate";
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

interface CodebookPreviewVariableProps {
  item: CodebookItem;
  parentLoop?: Extract<CodebookItem, { type: "unit_loop" }> | null;
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
 * Live interactive preview of a codebook item (see TODO.txt).
 * Displays real-time updates as the author edits the item's question prompt,
 * options, scale items, codes, colors, or unit layout.
 */
export function CodebookPreviewVariable({
  item,
  parentLoop,
  unitData = MOCK_UNIT_DATA,
  questions,
  answers,
  progress,
  controls,
}: CodebookPreviewVariableProps) {
  const [answerState, setAnswerState] = useState<{ value: VariableValue } | null>(null);

  const isVariable = item.type === "question" || item.type === "user_variable" || item.type === "unit_variable";
  const isLoop = item.type === "unit_loop";
  const isCondition = item.type === "condition";
  const inLoop = isLoop || item.type === "unit_variable" || (isVariable && !!parentLoop);
  const isAuto = isVariable && item.variable.type === "auto";

  const spanVariable = isVariable && inLoop && item.variable.type === "span" ? item.variable : null;

  const layout = isLoop
    ? item.layout
    : parentLoop?.layout ?? {
        template: "# $unit.headline\n\n$unit.text",
      };
  const loop = isLoop ? item : parentLoop;
  // Span questions' fields are selectable during every question, as while coding.
  const selectable = loop ? spanColumns(loop) : (spanVariable?.fields ?? []);
  const rendered = useRenderedLayout(layout, unitData, questions, answers, progress, selectable);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-3.5 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5 text-primary" />
          <span>Preview</span>
        </div>
        {answerState && (
          <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-mono text-primary font-medium">
            Answered: {JSON.stringify(answerState.value)}
          </span>
        )}
      </div>

      {controls}

      {/* Simulated Device Screen */}
      <div className="flex-1 overflow-y-auto bg-background/50 p-4">
        <div className="mx-auto flex max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md">
          {/* Mock Document Area (if unit variable or loop) */}
          {inLoop && (
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

          {/* Interactive Question Card */}
          {isVariable && !isAuto && (
            <div className="p-4 bg-card">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
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

          {/* Auto variables are assigned, never asked */}
          {isVariable && isAuto && (
            <div className="p-4 text-sm">
              <span className="text-xs font-semibold text-primary">Assigned variable</span>
              <p className="mt-1 text-xs text-muted-foreground">
                Coders never see this item. The server assigns its value when a coder starts; use it in conditions
                and layout templates.
              </p>
            </div>
          )}

          {/* Condition Preview */}
          {isCondition && (
            <div className="p-4 text-sm">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Condition Item</span>
              <p className="mt-1 text-xs text-muted-foreground">
                Shown when: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{describeCondition(item.condition)}</code>
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Condition items do not display a visible card to annotators; their rules or script decide which items are shown.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The layout with its values evaluated against the unit (and the preview
 * answers), like JobManager does while coding. Values using answers that
 * aren't set render as empty.
 */
function useRenderedLayout(
  layout: UnitLayout,
  unit: UnitData,
  questions: ReadonlyMap<string, AnyVariableType> | undefined,
  answers: Record<string, VariableValue> | undefined,
  progress: TemplateProgress | undefined,
  selectable: string[],
): RenderedTemplate {
  const [rendered, setRendered] = useState<RenderedTemplate>({ markdown: "", values: [] });
  const key = JSON.stringify([layout, unit, answers, progress, selectable]);
  useEffect(() => {
    let cancelled = false;
    const scope = buildScope(questions ?? new Map(), answers ?? {}, unit);
    renderTemplate(layout.template, scope, undefined, "preview", { progress, snippets: layout.snippets, selectable }).then(
      (result) => !cancelled && setRendered(result),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content: the default layout is a new object each render
  }, [key]);
  return rendered;
}
