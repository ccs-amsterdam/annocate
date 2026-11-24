import type { DesignItem } from "@annotinder/contracts";
import { defaultRandomOptions } from "./answerTypes";

/**
 * A new item of a type, as the editor adds it. A unit loop gets `loopId`:
 * the next id never used in the design (contracts `nextLoopId`).
 */
export function defaultItemForType(type: DesignItem["type"], name: string, loopId = "loop_1"): DesignItem {
  switch (type) {
    case "question":
      return {
        type: "question",
        name,
        // The answer type is chosen in the form ("to specify" until then).
        variable: { type: "unspecified" },
      } as DesignItem;
    case "experiment":
      return {
        type: "experiment",
        name,
        variable: { type: "experiment", draw: "random", options: defaultRandomOptions() },
      };
    case "unit_loop":
      // A new loop starts with a layout item, its questions are added in the
      // tree. By default it hands out all the session's units, once (its form changes that).
      return {
        type: "unit_loop",
        id: loopId,
        children: [{ type: "layout", template: "" }],
      } as DesignItem;
    case "layout":
      // The simple form starts empty: the researcher places the unit's fields
      return { type: "layout", template: "" };
    case "branch":
      // The condition is set in its form: empty until then (validation flags it)
      return { type: "branch", condition: { script: "" }, children: [] } as DesignItem;
    case "end":
      return { type: "end", name, outcome: "screenout" };
    case "session":
      return { type: "session" };
  }
}
