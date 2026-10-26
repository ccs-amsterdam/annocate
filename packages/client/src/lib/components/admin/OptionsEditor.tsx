import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from "lucide-react";
import { SWIPE_DIRECTIONS, valueFromLabel, type Option } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DIRECTION_ICONS = { left: ArrowLeft, right: ArrowRight, up: ArrowUp };

export interface OptionsEditorProps<T extends Option> {
  options: T[];
  onChange: (options: T[]) => void;
  /** Ordinal: numeric values rising in option order. Default nominal: string values derived from the labels. */
  level?: "nominal" | "ordinal";
  max?: number;
  /** Swipe options: shows the direction of each (1st left, 2nd right, 3rd up). */
  swipe?: boolean;
  /** Extra columns per option, e.g. the weight of an `auto` option. */
  extra?: (option: T, update: (patch: Partial<T>) => void) => React.ReactNode;
}

/**
 * The options of a question (docs/client.md §7): a label the coder sees and
 * the value that is stored. For nominal questions the value follows the
 * label (`Human interest` -> `human_interest`) until it is edited by hand;
 * for ordinal ones values are numbers rising in option order.
 */
export function OptionsEditor<T extends Option>({ options, onChange, level = "nominal", max, swipe, extra }: OptionsEditorProps<T>) {
  const ordinal = level === "ordinal";
  const update = (index: number, patch: Partial<T>) => onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const move = (index: number, by: number) => {
    const next = [...options];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    onChange(next);
  };

  const setLabel = (index: number, label: string) => {
    const option = options[index];
    const patch: Partial<Option> = { label: label === "" ? undefined : label };
    // The value follows the label while it was derived from it (or empty).
    if (!ordinal && (option.value === "" || option.value === valueFromLabel(option.label ?? String(option.value)))) {
      patch.value = valueFromLabel(label);
    }
    update(index, patch as Partial<T>);
  };

  const add = () => {
    const last = options[options.length - 1]?.value;
    const value = ordinal ? (typeof last === "number" ? last + 1 : 1) : "";
    onChange([...options, { value } as T]);
  };

  const rising = options.every((o, i) => i === 0 || (typeof o.value === "number" && o.value > (options[i - 1].value as number)));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Options</label>
        {ordinal && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => onChange(options.map((o, i) => ({ ...o, value: i + 1 })))}
          >
            Renumber 1..{options.length}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr_8rem_5.5rem_auto] items-center gap-1.5 text-[11px] text-muted-foreground">
        <span />
        <span>Label (shown)</span>
        <span>Value (stored)</span>
        <span>Color</span>
        <span />
        {options.map((option, i) => {
          const Direction = swipe ? DIRECTION_ICONS[SWIPE_DIRECTIONS[i]] : null;
          return (
            <div key={i} className="contents">
              <span className="flex w-5 justify-center">
                {Direction ? <Direction className="size-4 text-foreground" aria-label={`swipe ${SWIPE_DIRECTIONS[i]}`} /> : i + 1}
              </span>
              <Input
                placeholder={String(option.value) || "label"}
                value={option.label ?? ""}
                onChange={(e) => setLabel(i, e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="value"
                type={ordinal ? "number" : "text"}
                value={String(option.value)}
                onChange={(e) =>
                  update(i, { value: ordinal ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value } as Partial<T>)
                }
                className="h-8 font-mono text-xs"
              />
              <Input
                placeholder="color"
                value={option.color ?? ""}
                onChange={(e) => update(i, { color: e.target.value || undefined } as Partial<T>)}
                className="h-8 text-xs"
              />
              <span className="flex items-center">
                {extra?.(option, (patch) => update(i, patch))}
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === options.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onChange(options.filter((_, j) => j !== i))}
                  aria-label="Remove option"
                >
                  <X className="size-3.5" />
                </Button>
              </span>
            </div>
          );
        })}
      </div>
      {ordinal && !rising && (
        <p className="text-[11px] text-destructive">Ordinal values must rise in the order of the options: renumber them.</p>
      )}
      {(!max || options.length < max) && (
        <Button type="button" variant="outline" size="sm" onClick={add} className="self-start">
          + Add option
        </Button>
      )}
    </div>
  );
}
