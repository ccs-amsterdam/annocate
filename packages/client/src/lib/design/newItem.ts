import type { DesignItem } from "@annotinder/contracts";

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
      return { type: "computed", name, variable: { type: "random", draw: "random", options: [{ value: "control" }, { value: "experiment" }] } };
    case "unit_loop":
      // Like a condition, a new loop starts empty: its questions are added in
      // the tree. By default it hands out all the session's units, once (its form changes that).
      return {
        type: "unit_loop",
        layout: { template: "" },
        children: [],
      } as DesignItem;
    case "show_if":
      return {
        type: "show_if",
        condition: { script: "true" },
        children: [],
      } as DesignItem;
    case "end":
      return { type: "end", name, outcome: "screenout" };
    case "session":
      return { type: "session", params: [] };
  }
}
