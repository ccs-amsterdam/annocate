import { z } from "zod";
import { IdSchema } from "../common.js";
import type { Condition } from "./condition.js";
import type { ComputedItem, EndItem, InLoopItem, TopLevelItem, TopLevelQuestionItem, UnitLoopItem } from "./item.js";
import type { RandomVariable } from "./variableTypes.js";
import { DisplaySchema, STUDY_END_NAME, type SessionItem } from "./session.js";

// The coder codebook (docs/api/coder.md): what coders' browsers
// get of a codebook, only what the coding client needs. Unit loops keep
// their layout, questions and order (the server works out the units).
// Left out: how units are handed out (the loop's `units`: filters,
// criteria, overlap, practice and gold settings), the Study entry (its
// values come with the session), and how computed values are made (draw,
// weights, groups to balance within, linked columns).

/** A random computed variable as coders get it: its options (for labels; none for a column's free values). */
export type CoderRandomVariable = Pick<RandomVariable, "type"> & {
  options: Omit<NonNullable<RandomVariable["options"]>[number], "weight">[];
};

/** A computed item as coders get it: an invisible step that asks the server for its value. */
export type CoderComputedItem = Omit<ComputedItem, "variable"> & { variable: CoderRandomVariable };

export type CoderUnitLoopItem = Omit<UnitLoopItem, "units">;

export type CoderTopLevelItem =
  | TopLevelQuestionItem
  | CoderComputedItem
  | CoderUnitLoopItem
  | EndItem
  | { type: "questions"; label?: string; condition?: Condition; children: CoderTopLevelItem[] };

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
  return [...coderItems(items), ...end];
}

function coderItems(items: readonly TopLevelItem[]): CoderTopLevelItem[] {
  return items.flatMap((item): CoderTopLevelItem[] => {
    switch (item.type) {
      case "session":
        return [];
      case "questions":
        return [{ ...item, children: coderItems(item.children) }];
      case "unit_loop": {
        const loop: CoderUnitLoopItem = { ...item, children: item.children as InLoopItem[] };
        delete (loop as Partial<UnitLoopItem>).units;
        return [loop];
      }
      case "computed": {
        const options = (item.variable.options ?? []).map((o) => {
          const option = { ...o };
          delete option.weight;
          return option;
        });
        return [{ ...item, variable: { type: "random", options } }];
      }
      default:
        return [item];
    }
  });
}
