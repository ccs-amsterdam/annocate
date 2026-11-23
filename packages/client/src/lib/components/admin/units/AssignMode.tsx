/**
 * How a dialog changes a set column that exists: make it anew (overwriting
 * it), or give the units without a value one and keep every current
 * assignment (`assignWithoutValue`, setKinds.ts).
 */
export type AssignMode = "anew" | "empty";

export function AssignModeChoice({
  label,
  mode,
  empty,
  onChange,
}: {
  /** The column as people read it, e.g. "coder set". */
  label: string;
  mode: AssignMode;
  /** How many units have no value and aren't test units. */
  empty: number;
  onChange: (mode: AssignMode) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-semibold">The units have a {label}</legend>
      <label className="flex items-center gap-2 text-xs">
        <input type="radio" name="assign-mode" checked={mode === "anew"} onChange={() => onChange("anew")} />
        Make it anew (overwrites it)
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input
          type="radio"
          name="assign-mode"
          className="mt-0.5"
          checked={mode === "empty"}
          disabled={empty === 0}
          onChange={() => onChange("empty")}
        />
        <span className={empty === 0 ? "text-muted-foreground" : undefined}>
          Assign units without a value, keep the rest
          <span className="block text-muted-foreground">
            {empty === 0
              ? "Every unit has a value or is a test unit: there is nothing to assign."
              : `${empty} unit${empty === 1 ? " has" : "s have"} no value and ${empty === 1 ? "isn't a test unit" : "aren't test units"}.`}
          </span>
        </span>
      </label>
    </fieldset>
  );
}
