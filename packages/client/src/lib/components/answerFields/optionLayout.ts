import type { CSSProperties } from "react";

/** CSS for laying out option buttons: `flex` wraps and grows, `row` one equal row, `grid` columns. */
export function optionsContainerStyle(
  layout: "flex" | "row" | "grid",
  count: number,
  columns = 1,
): { className: string; style?: CSSProperties } {
  if (layout === "flex") return { className: "flex flex-wrap gap-1.5 [&>*]:grow" };
  const n = layout === "row" ? count : columns;
  return { className: "grid gap-1.5", style: { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } };
}
