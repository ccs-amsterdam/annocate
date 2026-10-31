import { z } from "zod";
import { IdSchema } from "../common.js";
import type { Condition } from "./condition.js";
import type { EndItem, InLoopItem, TopLevelItem, TopLevelQuestionItem, UnitLoopItem } from "./item.js";
import type { AutoType } from "./variableTypes.js";

// The coder codebook (docs/plans/special-sets.md §0): what coders' browsers
// get of a codebook, only what the coding client needs. Unit loops keep
// their layout, questions and order, and per branch only its condition (the
// client picks the branch; the server works out the units). Left out: how
// units are handed out (modes, sets, groups, overlap; later practice and
// gold), the Session item (its values come with the session), and how
// `auto` questions are drawn (source, weights, groups to balance within).

/** A loop branch as coders get it: only its condition. */
export interface CoderBranch {
  when?: Condition;
}

/** An `auto` question's answer type as coders get it: its options (for labels), not how it is drawn. */
export type CoderAutoType = Pick<AutoType, "type"> & { options: Omit<AutoType["options"][number], "weight">[] };

export type CoderUnitLoopItem = Omit<UnitLoopItem, "units"> & { units: CoderBranch[] };

export type CoderTopLevelItem =
  | (Omit<TopLevelQuestionItem, "variable"> & { variable: Exclude<TopLevelQuestionItem["variable"], AutoType> | CoderAutoType })
  | CoderUnitLoopItem
  | EndItem
  | { type: "condition"; label?: string; condition: Condition; children: CoderTopLevelItem[] };

/** The coder codebook of a published (or previewed) codebook version. */
export const CoderCodebookSchema = z.object({
  id: IdSchema,
  items: z.custom<CoderTopLevelItem[]>((v) => Array.isArray(v)),
});
export type CoderCodebook = z.infer<typeof CoderCodebookSchema>;

/** Strips a codebook's items to what coders get. */
export function toCoderItems(items: readonly TopLevelItem[]): CoderTopLevelItem[] {
  return items.flatMap((item): CoderTopLevelItem[] => {
    switch (item.type) {
      case "session":
        return [];
      case "condition":
        return [{ ...item, children: toCoderItems(item.children) }];
      case "unit_loop": {
        const { units, ...loop } = item;
        return [{ ...loop, children: loop.children as InLoopItem[], units: units.map((b) => (b.when ? { when: b.when } : {})) }];
      }
      case "question": {
        if (item.variable.type !== "auto") return [item as CoderTopLevelItem];
        const options = item.variable.options.map((o) => {
          const option = { ...o };
          delete option.weight;
          return option;
        });
        return [{ ...item, variable: { type: "auto", options } }];
      }
      default:
        return [item];
    }
  });
}
