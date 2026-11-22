import type { DesignItem } from "@annotinder/contracts";
import { defaultRandomOptions } from "./answerTypes";

/** A new item of a type, as the editor adds it. */
export function defaultItemForType(type: DesignItem["type"], name: string): DesignItem {
  switch (type) {
    case "question":
      return {
        type: "question",
        name,
        // The answer type is chosen in the form ("to specify" until then).
        variable: { type: "unspecified" },
      } as DesignItem;
    case "computed":
      return {
        type: "computed",
        name,
        variable: { type: "random", draw: "random", options: defaultRandomOptions() },
      };
    case "unit_loop":
      // A new loop starts with a layout item, its questions are added in the
      // tree. By default it hands out all the session's units, once (its form changes that).
      return {
        type: "unit_loop",
        children: [{ type: "layout", template: "" }],
      } as DesignItem;
    case "layout":
      // The simple form starts empty: the researcher places the unit's fields
      return { type: "layout", template: "" };
    case "block":
      // Without a label or a condition: always shown (its form sets them)
      return { type: "block", children: [] } as DesignItem;
    case "end":
      return { type: "end", name, outcome: "screenout" };
    case "session":
      return { type: "session" };
  }
}
