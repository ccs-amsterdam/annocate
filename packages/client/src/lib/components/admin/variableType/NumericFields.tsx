import { NUMERIC_LAYOUTS, type AnyVariableType, type NumericType } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LayoutSelect, selectClass } from "./LayoutSelect";

const STEP_PRESETS = [
  { step: 1, label: "Whole numbers" },
  { step: 0.1, label: "One decimal" },
  { step: 0.01, label: "Two decimals" },
];

/** A numeric question's range, steps, labelled values and layout. */
export function NumericFields({
  variable: v,
  onChange,
}: {
  variable: NumericType;
  onChange: (next: AnyVariableType) => void;
}) {
  const step = v.step ?? 1;
  const preset = STEP_PRESETS.some((p) => p.step === step);
  const numberOrUndefined = (text: string) => (text === "" ? undefined : Number(text));
  const labels = v.labels ?? [];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Minimum</label>
          <Input
            type="number"
            value={v.min ?? ""}
            onChange={(e) => onChange({ ...v, min: numberOrUndefined(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Maximum</label>
          <Input
            type="number"
            value={v.max ?? ""}
            onChange={(e) => onChange({ ...v, max: numberOrUndefined(e.target.value) })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Steps</label>
        <div className="flex gap-2">
          <select
            className={`${selectClass} flex-1`}
            value={preset ? String(step) : "custom"}
            onChange={(e) =>
              onChange({
                ...v,
                // A step of 1 is the default: left out
                step:
                  e.target.value === "custom" ? 5 : Number(e.target.value) === 1 ? undefined : Number(e.target.value),
              })
            }
          >
            {STEP_PRESETS.map((p) => (
              <option key={p.step} value={String(p.step)}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          {!preset && (
            <Input
              type="number"
              className="w-24"
              value={step}
              onChange={(e) =>
                onChange({ ...v, step: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })
              }
            />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Labels (optional)</label>
        {labels.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="number"
              className="w-24"
              value={l.value}
              onChange={(e) =>
                onChange({
                  ...v,
                  labels: labels.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)),
                })
              }
            />
            <Input
              className="flex-1"
              value={l.label}
              onChange={(e) =>
                onChange({ ...v, labels: labels.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove label"
              onClick={() => {
                const next = labels.filter((_, j) => j !== i);
                onChange({ ...v, labels: next.length ? next : undefined });
              }}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange({ ...v, labels: [...labels, { value: v.min ?? 0, label: "" }] })}
        >
          + Add label
        </Button>
      </div>
      <LayoutSelect
        variable={v}
        layouts={NUMERIC_LAYOUTS}
        onChange={(layout) =>
          onChange({ ...v, layout: layout === "auto" ? undefined : (layout as NumericType["layout"]) })
        }
      />
    </>
  );
}
