import { useState } from "react";
import type { CodebookItem, UnitData, VariableValue } from "@annotinder/contracts";
import { Question } from "../Question";
import { UnitFields } from "../UnitFields";
import { SpanAnnotationProvider } from "../../context/SpanAnnotationContext";
import { Smartphone } from "lucide-react";

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
}

/**
 * Live interactive preview of a codebook item (design plan & user TODO).
 * Displays real-time updates as the author edits the item's question prompt,
 * options, scale items, codes, colors, or unit layout.
 */
export function CodebookPreviewVariable({ item, parentLoop }: CodebookPreviewVariableProps) {
  const [answerState, setAnswerState] = useState<{ value: VariableValue; conditionValue?: unknown } | null>(null);

  const isVariable = item.type === "user_variable" || item.type === "unit_variable";
  const isLoop = item.type === "unit_loop";
  const isCondition = item.type === "condition";

  const spanVariable = item.type === "unit_variable" && item.variable.type === "span" ? item.variable : null;

  const layout = isLoop
    ? item.layout
    : parentLoop?.layout ?? {
        template: "# {{$unit.headline}}\n\n::tokenize[$unit.text]",
      };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-3.5 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5 text-primary" />
          <span>Live Variable Preview</span>
        </div>
        {answerState && (
          <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-mono text-primary font-medium">
            Answered: {JSON.stringify(answerState.conditionValue ?? answerState.value)}
          </span>
        )}
      </div>

      {/* Simulated Device Screen */}
      <div className="flex-1 overflow-y-auto bg-background/50 p-4">
        <div className="mx-auto flex max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md">
          {/* Mock Document Area (if unit variable or loop) */}
          {(item.type === "unit_variable" || isLoop) && (
            <div className="border-b border-border/60 bg-background p-4 text-sm">
              <span className="mb-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Mock Unit Document
              </span>
              {spanVariable ? (
                <SpanAnnotationProvider
                  key={item.name}
                  column={spanVariable.column}
                  codes={spanVariable.codes}
                  initialSpans={[]}
                >
                  <UnitFields layout={layout} data={MOCK_UNIT_DATA} />
                </SpanAnnotationProvider>
              ) : (
                <UnitFields layout={layout} data={MOCK_UNIT_DATA} />
              )}
            </div>
          )}

          {/* Interactive Question Card */}
          {isVariable && (
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
                onAnswer={(value, conditionValue) => setAnswerState({ value, conditionValue })}
              />
            </div>
          )}

          {/* Condition Preview */}
          {isCondition && (
            <div className="p-4 text-sm">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Condition Item</span>
              <p className="mt-1 text-xs text-muted-foreground">
                Expression: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{item.expression || "(empty)"}</code>
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Condition items do not display a visible card to annotators; they evaluate JavaScript logic to branch or filter items.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
