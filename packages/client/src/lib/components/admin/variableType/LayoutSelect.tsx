import { layoutWarning, resolveLayout, type AnyVariableType } from "@annotinder/contracts";

export const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

const LAYOUT_LABELS: Record<string, string> = {
  flex: "Flex (buttons wrap)",
  row: "Row (one row)",
  grid: "Grid (columns)",
  compact: "Compact (values; the selected one shows its label)",
  dropdown: "Dropdown with filter",
  input: "Number input",
  slider: "Slider",
  buttons: "Buttons (one per value)",
};

/** A resolved layout in words, e.g. "Grid, 2 columns". */
function describeLayout(resolved: ReturnType<typeof resolveLayout>): string {
  const label = LAYOUT_LABELS[resolved.layout] ?? resolved.layout;
  return "columns" in resolved && resolved.layout === "grid"
    ? `${label.split(" (")[0]}, ${resolved.columns} column${resolved.columns === 1 ? "" : "s"}`
    : label;
}

/** A layout select whose `auto` entry says what auto picks for this question (resolveLayout). */
export function LayoutSelect({
  variable,
  layouts,
  onChange,
}: {
  variable: AnyVariableType & { layout?: string };
  layouts: readonly string[];
  onChange: (layout: string) => void;
}) {
  const auto = resolveLayout({ ...variable, layout: undefined } as AnyVariableType);
  const warning = layoutWarning(variable);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Layout</label>
      <select className={selectClass} value={variable.layout ?? "auto"} onChange={(e) => onChange(e.target.value)}>
        {layouts.map((l) => (
          <option key={l} value={l}>
            {l === "auto" ? `Auto (${describeLayout(auto)})` : LAYOUT_LABELS[l]}
          </option>
        ))}
      </select>
      {warning && <p className="text-[11px] text-amber-600 dark:text-amber-400">{warning}</p>}
    </div>
  );
}
