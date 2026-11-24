import { optionLabel } from "./options.js";
import type {
  AnyVariableType,
  CategoricalType,
  NominalLayout,
  NumericLayout,
  NumericType,
  OrdinalLayout,
  ScaleLayout,
} from "./variableTypes.js";

// How an answer form is laid out (docs/client.md §4). In a fixed design
// (the default) `auto` is fixed per question, not per device, so every coder
// sees the same form: it is chosen for the smallest phones (about 360 px
// wide) within a height budget of half such a screen; larger screens show the
// same layout, centered. A responsive design's `auto` also follows the screen
// and the coder's keys (LayoutContext).

/** The design screen: a small phone, minus the page gutters. */
export const DESIGN_WIDTH = 344;
/** The question column on wider screens (tablets, computers): it doesn't grow beyond this. */
export const WIDE_WIDTH = 560;

/**
 * What a responsive design's "auto" layouts also follow (docs/client.md §4
 * "Display"): the screen (`narrow`: a phone; `wide`: more room) and the
 * coder's keys (the numpad: 3-column grids; typing to filter: buttons, no
 * dropdown). Fixed designs pass none: the same layout for every coder.
 */
export interface LayoutContext {
  width: "narrow" | "wide";
  keys?: string;
}
/** Half the height of a small phone. */
export const HEIGHT_BUDGET = 320;
/** A button row: about 40 px tall plus the gap. */
const ROW = 46;
const GAP = 6;
/** Approximate width of a character, and a button's horizontal padding. */
const CHAR = 8;
const PADDING = 24;

export type ResolvedLayout =
  | { layout: Exclude<NominalLayout | OrdinalLayout, "auto">; columns: number }
  | { layout: Exclude<NumericLayout, "auto"> }
  | { layout: Exclude<ScaleLayout, "auto"> }
  | { layout: "swipe" }
  | { layout: "none" };

const labelWidth = (labels: string[]) => Math.max(0, ...labels.map((l) => l.length)) * CHAR + PADDING;

/** Whether n buttons fit side by side in one row (at most 3 on a phone, 5 with more room). */
function fitsRow(labels: string[], width = DESIGN_WIDTH): boolean {
  const n = labels.length;
  return n <= (width > DESIGN_WIDTH ? 5 : 3) && labelWidth(labels) <= (width - (n - 1) * GAP) / n;
}

/** Whether a grid with `columns` columns fits in width (labels on one line) and height. */
function fitsGrid(labels: string[], columns: number, width = DESIGN_WIDTH): boolean {
  const rows = Math.ceil(labels.length / columns);
  return rows * ROW <= HEIGHT_BUDGET && labelWidth(labels) <= (width - (columns - 1) * GAP) / columns;
}

function categoricalLayout(variable: CategoricalType, context?: LayoutContext): ResolvedLayout {
  const labels = variable.options.map(optionLabel);
  if (variable.layout && variable.layout !== "auto") {
    return { layout: variable.layout, columns: variable.layout === "grid" ? (variable.columns ?? 1) : 1 };
  }
  // Responsive: the numpad's 3 columns, the same in every question
  if (context?.keys === "numpad") return { layout: "grid", columns: 3 };
  const width = context?.width === "wide" ? WIDE_WIDTH : DESIGN_WIDTH;
  if (variable.type === "ordinal") {
    if (labels.length <= 3 || (context && fitsRow(labels, width))) return { layout: "row", columns: 1 };
    if (labels.length * ROW <= HEIGHT_BUDGET) return { layout: "grid", columns: 1 };
    return { layout: "compact", columns: 1 };
  }
  if (fitsRow(labels, width)) return { layout: "row", columns: 1 };
  // Ten or more: a dropdown with its filter box (typing to filter works on buttons)
  if (labels.length >= 10)
    return context?.keys === "filter" ? { layout: "flex", columns: 1 } : { layout: "dropdown", columns: 1 };
  if (context?.width === "wide" && fitsGrid(labels, 3, width)) return { layout: "grid", columns: 3 };
  if (fitsGrid(labels, 2, width)) return { layout: "grid", columns: 2 };
  if (fitsGrid(labels, 1, width)) return { layout: "grid", columns: 1 };
  // Typing to filter works on buttons: no dropdown
  if (context?.keys === "filter") return { layout: "flex", columns: 1 };
  return { layout: "dropdown", columns: 1 };
}

/** The number of values a numeric question allows, or null for an open range. */
export function numericSteps(variable: Pick<NumericType, "min" | "max" | "step">): number | null {
  if (variable.min === undefined || variable.max === undefined) return null;
  return Math.floor((variable.max - variable.min) / (variable.step ?? 1) + 1e-9) + 1;
}

function numericLayout(variable: NumericType): ResolvedLayout {
  if (variable.layout && variable.layout !== "auto") return { layout: variable.layout };
  const steps = numericSteps(variable);
  if (steps === null) return { layout: "input" };
  // A few values: buttons; from 7, a slider (ten small buttons are hard to tell apart)
  return { layout: steps <= 6 ? "buttons" : "slider" };
}

/** The layout a question is shown with: its own, or what `auto` picks. */
export function resolveLayout(variable: AnyVariableType, context?: LayoutContext): ResolvedLayout {
  switch (variable.type) {
    case "nominal":
    case "ordinal":
      return categoricalLayout(variable, context);
    case "numeric":
      return numericLayout(variable);
    case "scale":
      return { layout: variable.layout && variable.layout !== "auto" ? variable.layout : "compact" };
    case "annotinder":
      return { layout: "swipe" };
    default:
      return { layout: "none" };
  }
}

/**
 * A warning when a researcher-picked layout doesn't fit a single question on
 * the smallest phone (single questions never scroll); null if it fits.
 */
export function layoutWarning(variable: AnyVariableType): string | null {
  if ((variable.type !== "nominal" && variable.type !== "ordinal") || !variable.layout || variable.layout === "auto")
    return null;
  const labels = variable.options.map(optionLabel);
  const tooTall = "doesn't fit half a small phone screen; coders would have to scroll (auto picks a layout that fits)";
  switch (variable.layout) {
    case "row":
      return fitsRow(labels) ? null : "These options don't fit side by side on a small phone";
    case "grid":
      return fitsGrid(labels, variable.columns ?? 1) ? null : `This grid ${tooTall}`;
    case "flex": {
      // Buttons wrap: estimate the rows by filling them greedily.
      let rows = 1;
      let width = 0;
      for (const label of labels) {
        const w = label.length * CHAR + PADDING;
        if (width > 0 && width + GAP + w > DESIGN_WIDTH) {
          rows++;
          width = w;
        } else {
          width += (width > 0 ? GAP : 0) + w;
        }
      }
      return rows * ROW <= HEIGHT_BUDGET ? null : `This layout ${tooTall}`;
    }
    case "compact":
      // One row of value buttons, at least 28 px wide each.
      return labels.length * 28 <= DESIGN_WIDTH ? null : "Too many options for one row of the compact layout";
    default:
      return null;
  }
}
