import { optionLabel } from "./options.js";
import type { AnyVariableType, CategoricalLayout, CategoricalType, NumericLayout, NumericType, ScaleLayout } from "./variableTypes.js";

// How an answer form is laid out (docs/client.md §4). `auto` is fixed per
// question, not per device, so every coder sees the same form: it is chosen
// for the smallest phones (about 360 px wide) within a height budget of half
// such a screen. Larger screens show the same layout, centered.

/** The design screen: a small phone, minus the page gutters. */
export const DESIGN_WIDTH = 344;
/** Half the height of a small phone. */
export const HEIGHT_BUDGET = 320;
/** A button row: about 40 px tall plus the gap. */
const ROW = 46;
const GAP = 6;
/** Approximate width of a character, and a button's horizontal padding. */
const CHAR = 8;
const PADDING = 24;

export type ResolvedLayout =
  | { layout: Exclude<CategoricalLayout, "auto">; columns: number }
  | { layout: Exclude<NumericLayout, "auto"> }
  | { layout: Exclude<ScaleLayout, "auto"> }
  | { layout: "swipe" }
  | { layout: "none" };

const labelWidth = (labels: string[]) => Math.max(0, ...labels.map((l) => l.length)) * CHAR + PADDING;

/** Whether n buttons fit side by side in one row. */
function fitsRow(labels: string[]): boolean {
  const n = labels.length;
  return n <= 3 && labelWidth(labels) <= (DESIGN_WIDTH - (n - 1) * GAP) / n;
}

/** Whether a grid with `columns` columns fits in width (labels on one line) and height. */
function fitsGrid(labels: string[], columns: number): boolean {
  const rows = Math.ceil(labels.length / columns);
  return rows * ROW <= HEIGHT_BUDGET && labelWidth(labels) <= (DESIGN_WIDTH - (columns - 1) * GAP) / columns;
}

function categorical(variable: CategoricalType): ResolvedLayout {
  const labels = variable.options.map(optionLabel);
  if (variable.layout && variable.layout !== "auto") {
    return { layout: variable.layout, columns: variable.layout === "grid" ? (variable.columns ?? 1) : 1 };
  }
  if (variable.level === "ordinal") {
    if (labels.length <= 3) return { layout: "row", columns: 1 };
    if (labels.length * ROW <= HEIGHT_BUDGET) return { layout: "grid", columns: 1 };
    return { layout: "compact", columns: 1 };
  }
  if (fitsRow(labels)) return { layout: "row", columns: 1 };
  if (fitsGrid(labels, 2)) return { layout: "grid", columns: 2 };
  if (fitsGrid(labels, 1)) return { layout: "grid", columns: 1 };
  return { layout: "dropdown", columns: 1 };
}

/** The number of values a numeric question allows, or null for an open range. */
export function numericSteps(variable: Pick<NumericType, "min" | "max" | "step">): number | null {
  if (variable.min === undefined || variable.max === undefined) return null;
  return Math.floor((variable.max - variable.min) / (variable.step ?? 1) + 1e-9) + 1;
}

function numeric(variable: NumericType): ResolvedLayout {
  if (variable.layout && variable.layout !== "auto") return { layout: variable.layout };
  const steps = numericSteps(variable);
  if (steps === null) return { layout: "input" };
  return { layout: steps <= 11 ? "buttons" : "slider" };
}

/** The layout a question is shown with: its own, or what `auto` picks. */
export function resolveLayout(variable: AnyVariableType): ResolvedLayout {
  switch (variable.type) {
    case "categorical":
      return categorical(variable);
    case "numeric":
      return numeric(variable);
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
  if (variable.type !== "categorical" || !variable.layout || variable.layout === "auto") return null;
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
