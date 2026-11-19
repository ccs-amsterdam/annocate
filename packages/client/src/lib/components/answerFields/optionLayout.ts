import { useEffect, type CSSProperties } from "react";

/** Number keys 1-9 pick the first nine options. Pass null to listen to nothing. */
export function useNumberShortcuts(count: number, onPick: ((index: number) => void) | null) {
  useEffect(() => {
    if (!onPick) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const index = Number.parseInt(event.key, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= Math.min(count, 9)) return;
      event.preventDefault();
      onPick(index);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, onPick]);
}

/** CSS for laying out option buttons: `flex` wraps and grows, `row` one equal row, `grid` columns. */
export function optionsContainerStyle(layout: "flex" | "row" | "grid", count: number, columns = 1): { className: string; style?: CSSProperties } {
  if (layout === "flex") return { className: "flex flex-wrap gap-1.5 [&>*]:grow" };
  const n = layout === "row" ? count : columns;
  return { className: "grid gap-1.5", style: { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } };
}
