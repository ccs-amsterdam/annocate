import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  collectQuestions,
  parseTemplateBlocks,
  templateReferences,
  type AnyVariableType,
  type CodebookItem,
  type OptionValue,
  type TemplateNode,
  type UnitLoopItem,
  type VariableValue,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useUnitPageQuery } from "../../../admin/queries";
import { enclosingLoop, flattenTree } from "../../../codebook/tree";
import { CodebookPreviewVariable } from "../CodebookPreviewVariable";
import type { CodebookDraft } from "./useCodebookDraft";

const selectClass = "h-7 rounded-md border border-input bg-background px-1.5 text-xs";

/** A loop's questions in order (through conditions). */
function loopQuestionNames(loop: UnitLoopItem): string[] {
  return flattenTree(loop.children).flatMap((i) => (i.type !== "condition" && "name" in i ? [i.name] : []));
}

/** The questions a template refers to, in its values and in its blocks' conditions. */
function referencedQuestions(template: string): string[] {
  const names = templateReferences(template).references.filter((r) => r.ns === "var").map((r) => r.path[0]);
  const walk = (nodes: TemplateNode[]) => {
    for (const node of nodes) {
      if (node.type === "if") {
        for (const b of node.branches) {
          names.push(...b.references.filter((r) => r.ns === "var").map((r) => r.path[0]));
          walk(b.body);
        }
      } else if (node.type === "from") node.stages.forEach((s) => walk(s.body));
      else if (node.type === "style") walk(node.body);
    }
  };
  walk(parseTemplateBlocks(template).nodes);
  return [...new Set(names)];
}

/** The options of a question to pick a preview answer from, if it has any. */
function optionsOf(variable: AnyVariableType | undefined): { value: OptionValue; label?: string }[] | null {
  return variable && "options" in variable && Array.isArray(variable.options) ? variable.options : null;
}

/**
 * The live preview of the selected item (docs/client.md §7, "Preview"):
 * for a loop (or an item in one) with a unit of the job, the question on
 * screen (for `::: from` blocks) and answers to the questions the layout
 * uses (for `::: if` blocks and values).
 */
export function ItemPreview({ client, draft, item }: { client: ResearcherApi; draft: CodebookDraft; item: CodebookItem }) {
  const loop = item.type === "unit_loop" ? (item as UnitLoopItem) : enclosingLoop(draft.items, item);
  const { questions } = useMemo(() => collectQuestions(draft.cleanItems), [draft.cleanItems]);
  const order = loop ? loopQuestionNames(loop) : [];

  const [unitIndex, setUnitIndex] = useState(0);
  const page = useUnitPageQuery(client, { offset: unitIndex, limit: 1 });
  const unit = loop ? page.data?.units[0] : undefined;
  const total = page.data?.total ?? 0;

  const selectedQuestion = "name" in item && order.includes(item.name) ? item.name : null;
  const [onScreen, setOnScreen] = useState<string | null>(null);
  const current = onScreen ?? selectedQuestion ?? order[0] ?? null;

  const [picked, setPicked] = useState<Record<string, number>>({});
  const used = loop ? referencedQuestions(loop.layout?.template ?? "").filter((q) => optionsOf(questions.get(q))) : [];
  const answers: Record<string, VariableValue> = {};
  for (const q of used) {
    const options = optionsOf(questions.get(q));
    const i = picked[q];
    if (options && i !== undefined && options[i]) answers[q] = { done: true, skip: false, values: [{ value: options[i].value }] };
  }

  const controls = loop && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/80 px-3.5 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        Unit
        <button type="button" className="rounded p-0.5 hover:bg-muted disabled:opacity-40" disabled={unitIndex === 0} onClick={() => setUnitIndex(unitIndex - 1)} aria-label="Previous unit">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="font-medium text-foreground">{total ? `${unit?.externalId ?? "…"} (${unitIndex + 1}/${total})` : "example"}</span>
        <button type="button" className="rounded p-0.5 hover:bg-muted disabled:opacity-40" disabled={unitIndex + 1 >= total} onClick={() => setUnitIndex(unitIndex + 1)} aria-label="Next unit">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </span>
      {order.length > 0 && (
        <label className="flex items-center gap-1.5">
          On screen
          <select className={selectClass} value={current ?? ""} onChange={(e) => setOnScreen(e.target.value)}>
            {order.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
      )}
      {used.map((q) => (
        <label key={q} className="flex items-center gap-1.5">
          {q}
          <select
            className={selectClass}
            value={picked[q] ?? ""}
            onChange={(e) => {
              const next = { ...picked, [q]: Number(e.target.value) };
              if (e.target.value === "") delete next[q];
              setPicked(next);
            }}
          >
            <option value="">(no answer)</option>
            {optionsOf(questions.get(q))!.map((o, i) => (
              <option key={String(o.value)} value={i}>
                {o.label ?? String(o.value)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );

  return (
    <CodebookPreviewVariable
      item={item}
      parentLoop={loop}
      unitData={unit?.data}
      questions={questions}
      answers={answers}
      progress={loop ? { current, order } : undefined}
      controls={controls}
    />
  );
}
