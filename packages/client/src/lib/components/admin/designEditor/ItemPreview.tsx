import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  collectQuestions,
  itemName,
  loopLayouts,
  parseTemplateBlocks,
  PART_SET,
  templateReferences,
  type AnyVariableType,
  type DesignItem,
  type OptionValue,
  type TemplateNode,
  type UnitLayout,
  type UnitLoopItem,
  type VariableValue,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useSetGroupsQuery, useUnitPageQuery } from "../../../admin/queries";
import { enclosingLoop, flattenTree } from "../../../codebook/tree";
import { layoutForPreview, savedLoop } from "../../../design/loopLayouts";
import { QuestionPreview } from "../QuestionPreview";
import type { DesignDraft } from "./useDesignDraft";

const selectClass = "h-7 rounded-md border border-input bg-background px-1.5 text-xs";

/** A loop's questions in order (through branches). */
function loopQuestionNames(loop: UnitLoopItem): string[] {
  return flattenTree(loop.children).flatMap((i) => (i.type !== "branch" && "name" in i ? [i.name] : []));
}

/** The questions a template refers to, in its values and in its blocks' conditions. */
function referencedQuestions(template: string): string[] {
  const names = templateReferences(template)
    .references.filter((r) => r.ns === "var")
    .map((r) => r.path[0]);
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

/** The layout to show the unit with: the selected layout; for a loop its first; else the last before the item. */
function previewLayoutOf(item: DesignItem, saved: UnitLoopItem | undefined): UnitLayout | null {
  if (item.type === "layout") return item;
  if (!saved) return null;
  if (item.type === "unit_loop") return loopLayouts(saved.children)[0] ?? null;
  return layoutForPreview(saved, itemName(item));
}

/**
 * The unit the preview shows: one of the study's, paged through, from all
 * units or from one set (by default the loop's own: its part, if any).
 */
function usePreviewUnit(client: ResearcherApi, loop: UnitLoopItem | undefined) {
  const [index, setIndex] = useState(0);
  const sets = (useSetGroupsQuery(client).data ?? []).flatMap((g) =>
    g.sets.map((set) => ({ group: g.name, set: set.name, key: `${g.name}/${set.name}` })),
  );
  const part = loop?.units?.part;
  const loopSet = part !== undefined ? `${PART_SET}/${part}` : null;
  const [chosenSet, setChosenSet] = useState<string | null | undefined>(undefined);
  const setKey = chosenSet === undefined ? (sets.some((s) => s.key === loopSet) ? loopSet : null) : chosenSet;
  const chosen = sets.find((s) => s.key === setKey);
  const page = useUnitPageQuery(client, { offset: index, limit: 1, group: chosen?.group, set: chosen?.set });
  return {
    index,
    setIndex,
    sets,
    setKey,
    /** Units from another set (null: all units), from its first. */
    chooseSet: (key: string | null) => {
      setChosenSet(key);
      setIndex(0);
    },
    unit: loop ? page.data?.units[0] : undefined,
    total: page.data?.total ?? 0,
  };
}

/** The answers picked for the preview, as the coding screen has them. */
function pickedAnswers(
  used: string[],
  picked: Record<string, number>,
  questions: Map<string, AnyVariableType>,
): Record<string, VariableValue> {
  const answers: Record<string, VariableValue> = {};
  for (const q of used) {
    const option = optionsOf(questions.get(q))?.[picked[q] ?? -1];
    if (option) answers[q] = { done: true, skip: false, values: [{ value: option.value }] };
  }
  return answers;
}

/**
 * The live preview of the selected item (docs/client.md §7, "Preview"):
 * for a loop (or an item in one) with a unit of the study, the question on
 * screen (for `::: from` blocks) and answers to the questions the layout
 * uses (for `::: if` blocks and values).
 */
export function ItemPreview({ client, draft, item }: { client: ResearcherApi; draft: DesignDraft; item: DesignItem }) {
  const loop = item.type === "unit_loop" ? (item as UnitLoopItem) : enclosingLoop(draft.items, item);
  const { questions } = useMemo(() => collectQuestions(draft.cleanItems), [draft.cleanItems]);
  const saved = loop ? savedLoop(draft.items, draft.cleanItems, loop) : undefined;
  const layout = previewLayoutOf(item, saved);
  const order = loop ? loopQuestionNames(loop) : [];
  const units = usePreviewUnit(client, loop);

  const selectedQuestion = "name" in item && order.includes(item.name) ? item.name : null;
  const [onScreen, setOnScreen] = useState<string | null>(null);
  const current = onScreen ?? selectedQuestion ?? order[0] ?? null;

  const [picked, setPicked] = useState<Record<string, number>>({});
  const used = layout ? referencedQuestions(layout.template).filter((q) => optionsOf(questions.get(q))) : [];

  return (
    <QuestionPreview
      item={item}
      layout={layout}
      parentLoop={loop}
      unitData={units.unit?.data}
      questions={questions}
      answers={pickedAnswers(used, picked, questions)}
      progress={loop ? { current, order } : undefined}
      controls={
        loop && (
          <PreviewControls
            units={units}
            order={order}
            current={current}
            onScreen={setOnScreen}
            used={used}
            questions={questions}
            picked={picked}
            onPick={setPicked}
          />
        )
      }
    />
  );
}

/** Above the preview: which unit, which question is on screen, and answers to the questions the layout uses. */
function PreviewControls({
  units,
  order,
  current,
  onScreen,
  used,
  questions,
  picked,
  onPick,
}: {
  units: ReturnType<typeof usePreviewUnit>;
  /** The loop's questions, in order. */
  order: string[];
  current: string | null;
  onScreen: (question: string) => void;
  /** The questions the layout uses that have options to pick an answer from. */
  used: string[];
  questions: Map<string, AnyVariableType>;
  /** The picked answer of each, as the index of its option. */
  picked: Record<string, number>;
  onPick: (picked: Record<string, number>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/80 px-3.5 py-2 text-xs text-muted-foreground">
      {units.sets.length > 0 && (
        <select
          aria-label="Units from"
          className={selectClass}
          value={units.setKey ?? ""}
          onChange={(e) => units.chooseSet(e.target.value || null)}
        >
          <option value="">All units</option>
          {units.sets.map((s) => (
            <option key={s.key} value={s.key}>
              {s.set} ({s.group})
            </option>
          ))}
        </select>
      )}
      <span className="flex items-center gap-1">
        Unit
        <button
          type="button"
          className="rounded p-0.5 hover:bg-muted disabled:opacity-40"
          disabled={units.index === 0}
          onClick={() => units.setIndex(units.index - 1)}
          aria-label="Previous unit"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="font-medium text-foreground">
          {units.total ? `${units.unit?.externalId ?? "…"} (${units.index + 1}/${units.total})` : "example"}
        </span>
        <button
          type="button"
          className="rounded p-0.5 hover:bg-muted disabled:opacity-40"
          disabled={units.index + 1 >= units.total}
          onClick={() => units.setIndex(units.index + 1)}
          aria-label="Next unit"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </span>
      {order.length > 0 && (
        <label className="flex items-center gap-1.5">
          On screen
          <select className={selectClass} value={current ?? ""} onChange={(e) => onScreen(e.target.value)}>
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
              onPick(next);
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
}
