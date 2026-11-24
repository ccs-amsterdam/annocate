import { z } from "zod";
import { IdSchema } from "../common.js";
import type { Condition } from "./condition.js";
import type { ExperimentItem, EndItem, InLoopItem, TopLevelItem, TopLevelQuestionItem, UnitLoopItem } from "./item.js";
import type { ExperimentVariable } from "./variableTypes.js";
import { DisplaySchema, STUDY_END_NAME, type SessionItem } from "./session.js";

// The coder codebook (docs/api/coder.md): what coders' browsers
// get of a codebook, only what the coding client needs. Unit loops keep
// their layout items, questions and order (the server works out the units).
// Left out: the editor's labels of branches and layouts, how units are handed out (the loop's `units`: filters,
// criteria, overlap, practice and gold settings), the Study entry (its
// values come with the session), and how experiments' conditions are assigned (draw,
// URL parameter, weights, groups to balance within, selecting units).

/** An experiment's variable as coders get it: its options (none for a column's free values), with their labels only if the design shows them (`$var.<name>.label`). */
export type CoderRandomVariable = Pick<ExperimentVariable, "type"> & {
  options: Omit<NonNullable<ExperimentVariable["options"]>[number], "weight">[];
};

/** An experiment as coders get it: an invisible step that asks the server for its value. */
export type CoderExperimentItem = Omit<ExperimentItem, "variable"> & { variable: CoderRandomVariable };

export type CoderUnitLoopItem = Omit<UnitLoopItem, "units">;

export type CoderTopLevelItem =
  | TopLevelQuestionItem
  | CoderExperimentItem
  | CoderUnitLoopItem
  | EndItem
  | {
      type: "branch";
      condition: Condition;
      children: CoderTopLevelItem[];
      elseChildren?: CoderTopLevelItem[];
    };

/** The coder codebook of a deployed (or previewed) design version. */
export const CoderCodebookSchema = z.object({
  id: IdSchema,
  /** The study's public title (the design's `public.title`); null without one. */
  title: z.string().nullable(),
  /** How the coding screen looks (the Study entry's `display`); absent: the defaults. */
  display: DisplaySchema.optional(),
  items: z.custom<CoderTopLevelItem[]>((v) => Array.isArray(v)),
});
export type CoderCodebook = z.infer<typeof CoderCodebookSchema>;

/** Strips a codebook's items to what coders get. */
export function toCoderItems(items: readonly TopLevelItem[]): CoderTopLevelItem[] {
  // The study's normal end (the Study entry's `end`): an end item after the last item
  const study = items.find((i) => i.type === "session") as SessionItem | undefined;
  const end: CoderTopLevelItem[] = study?.end
    ? [{ type: "end", name: STUDY_END_NAME, outcome: "complete", ...study.end } as CoderTopLevelItem]
    : [];
  const texts = JSON.stringify(items);
  /** Whether the design shows or uses the label of this question's answer (`$var.<name>.label`). */
  const labelUsed = (name: string) => new RegExp(`\\$var\\.${name}\\.label\\b`).test(texts);
  return [...coderItems(items, labelUsed), ...end];
}

function coderItems(items: readonly TopLevelItem[], labelUsed: (name: string) => boolean): CoderTopLevelItem[] {
  return items.flatMap((item): CoderTopLevelItem[] => {
    switch (item.type) {
      case "session":
        return [];
      case "branch":
        return [
          {
            type: "branch",
            condition: item.condition,
            children: coderItems(item.children, labelUsed),
            ...(item.elseChildren ? { elseChildren: coderItems(item.elseChildren, labelUsed) } : {}),
          },
        ];
      case "unit_loop": {
        // The loop's label stays: it is in the coder's navigation menu
        const loop: CoderUnitLoopItem = { ...item, children: coderLoopItems(item.children) };
        delete (loop as Partial<UnitLoopItem>).units;
        return [loop];
      }
      case "experiment":
        return [{ ...item, variable: { type: "experiment", options: coderConditions(item, labelUsed(item.name)) } }];
      default:
        return [item];
    }
  });
}

/** A loop's items without the editor's labels of branches and layouts. */
function coderLoopItems(items: readonly InLoopItem[]): InLoopItem[] {
  return items.map((item): InLoopItem => {
    if (item.type !== "branch" && item.type !== "layout") return item;
    const { label: _label, ...rest } = item;
    void _label;
    if (rest.type === "layout") return rest;
    return {
      ...rest,
      children: coderLoopItems(rest.children),
      ...(rest.elseChildren ? { elseChildren: coderLoopItems(rest.elseChildren) } : {}),
    };
  });
}

/**
 * An experiment's conditions as coders get them: without their weights, and
 * without their labels (which may say what the experiment is about) unless
 * the design shows them.
 */
function coderConditions(item: ExperimentItem, withLabels: boolean): CoderRandomVariable["options"] {
  return (item.variable.options ?? []).map(({ weight: _weight, label, ...option }) => {
    void _weight;
    return withLabels && label !== undefined ? { ...option, label } : option;
  });
}
