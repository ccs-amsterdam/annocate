import { Button } from "@/components/ui/button";
import { NumberLabels } from "./NumberLabels";
import type { NumericVariable } from "./numericKeys";

/** Buttons per row: all of them up to 11, else as many rows as needed, evenly filled (20: 2 rows of 10). */
function rowLength(n: number): number {
  return Math.ceil(n / Math.ceil(n / 11));
}

/** A button per value (a small range), with the labels of break points under them. */
export function NumberButtons({
  variable,
  values,
  value,
  onAnswer,
}: {
  variable: NumericVariable;
  values: number[];
  /** The value chosen, if any. */
  value: number | null;
  onAnswer: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* Equal widths, up to 11 in a row (they fit a small phone); more are spread evenly over rows */}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${rowLength(values.length)}, minmax(0, 1fr))` }}
      >
        {values.map((n) => (
          <Button
            key={n}
            type="button"
            variant={value === n ? "default" : "outline"}
            className="h-10 min-w-0 px-1"
            aria-pressed={value === n}
            data-key-target=""
            onClick={() => onAnswer(n)}
          >
            {n}
          </Button>
        ))}
      </div>
      <NumberLabels labels={variable.labels ?? []} min={variable.min!} max={variable.max!} />
    </div>
  );
}
