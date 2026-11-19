import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CircleHelp, X } from "lucide-react";
import { SWIPE_DIRECTIONS, valueFromLabel, type Option } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpButton } from "../../help/HelpButton";

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
 * label (`Human interest` -> `human_interest`) until it is edited by hand.
 * Ordinal values are 1..n in option order, renumbered when options are
 * added, removed or moved; with "Custom values" they are set by hand (any
 * numbers rising in order). Custom isn't stored: options that aren't 1..n
 * open as custom.
 */
export function OptionsEditor<T extends Option>({
  options,
  onChange,
  level = "nominal",
  max,
  swipe,
  extra,
}: OptionsEditorProps<T>) {
  const ordinal = level === "ordinal";
  const [custom, setCustom] = useState(() => ordinal && !isSequence(options));
  const auto = ordinal && !custom;
  /** Changes to the list of options: renumbered while values follow the order. */
  const commit = (next: T[]) => onChange(auto ? renumber(next) : next);
  const update = (index: number, patch: Partial<T>) =>
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  // A moved option and the one it swapped places with slide past each other
  const grid = useRef<HTMLDivElement>(null);
  const swapped = useRef<{ moved: number; other: number } | null>(null);
  const move = (index: number, by: number) => {
    const next = [...options];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    swapped.current = { moved: index + by, other: index };
    commit(next);
  };
  useLayoutEffect(() => {
    const swap = swapped.current;
    swapped.current = null;
    if (!swap || !grid.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const cells = (row: number) =>
      Array.from(grid.current!.querySelectorAll<HTMLElement>(`[data-option-row="${row}"]`));
    const top = (row: number) => cells(row)[0]?.getBoundingClientRect().top ?? 0;
    const dy = top(swap.other) - top(swap.moved);
    const slide = (row: number, from: number) =>
      cells(row).forEach((el) =>
        el.animate([{ transform: `translateY(${from}px)` }, { transform: "none" }], {
          duration: 220,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        }),
      );
    slide(swap.moved, dy);
    slide(swap.other, -dy);
  }, [options]);

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
    commit([...options, { value } as T]);
  };

  const rising = options.every(
    (o, i) => i === 0 || (typeof o.value === "number" && o.value > (options[i - 1].value as number)),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Options</label>
        {!ordinal && <NumericCodesHelp />}
        {ordinal && (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => {
                setCustom(e.target.checked);
                // Back to values that follow the order.
                if (!e.target.checked) onChange(renumber(options));
              }}
            />
            Custom values
          </label>
        )}
      </div>
      <div
        ref={grid}
        className="grid grid-cols-[auto_1fr_8rem_5.5rem_auto] items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <span />
        <span>Label (shown)</span>
        <span>Value (stored)</span>
        <span>Color</span>
        <span />
        {options.map((option, i) => {
          const Direction = swipe ? DIRECTION_ICONS[SWIPE_DIRECTIONS[i]] : null;
          return (
            <div key={i} className="contents">
              <span data-option-row={i} className="flex w-5 justify-center">
                {Direction ? (
                  <Direction className="size-4 text-foreground" aria-label={`swipe ${SWIPE_DIRECTIONS[i]}`} />
                ) : (
                  i + 1
                )}
              </span>
              <Input
                data-option-row={i}
                placeholder={String(option.value) || "label"}
                value={option.label ?? ""}
                onChange={(e) => setLabel(i, e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                data-option-row={i}
                placeholder="value"
                type={ordinal ? "number" : "text"}
                value={String(option.value)}
                readOnly={auto}
                tabIndex={auto ? -1 : undefined}
                title={auto ? "Follows the order of the options (check Custom values to set it)" : undefined}
                onChange={(e) =>
                  update(i, {
                    value: ordinal ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value,
                  } as Partial<T>)
                }
                className={`h-8 font-mono text-xs ${auto ? "bg-muted/40 text-muted-foreground" : ""}`}
              />
              <Input
                data-option-row={i}
                placeholder="color"
                value={option.color ?? ""}
                onChange={(e) => update(i, { color: e.target.value || undefined } as Partial<T>)}
                className="h-8 text-xs"
              />
              <span data-option-row={i} className="flex items-center">
                {extra?.(option, (patch) => update(i, patch))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
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
                  onClick={() => commit(options.filter((_, j) => j !== i))}
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
        <p className="text-[11px] text-destructive">Ordinal values must rise in the order of the options.</p>
      )}
      {(!max || options.length < max) && (
        <Button type="button" variant="outline" size="sm" onClick={add} className="self-start">
          + Add option
        </Button>
      )}
    </div>
  );
}

/** Whether ordinal values are 1..n in option order. */
function isSequence(options: Option[]): boolean {
  return options.every((o, i) => o.value === i + 1);
}

function renumber<T extends Option>(options: T[]): T[] {
  return options.map((o, i) => ({ ...o, value: i + 1 }));
}

/** Where the "Custom values" box is for ordinal questions: that values can be numbers (the codes of an existing codebook). */
function NumericCodesHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <CircleHelp className="h-3.5 w-3.5 shrink-0" />
          Numeric values
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-2 text-xs">
        <p>Values of nominal answers are text, but can use numbers if you prefer labeled numeric values:</p>
        <div className="family-mono grid grid-cols-[4rem_1fr] text-[11px] text-primary/80">
          <div className="font-bold">Label</div>
          <div className="font-bold">Value</div>
          <div>Politics</div>
          <div>1</div>
          <div>Economy</div>
          <div>2</div>
          <div>Other</div>
          <div>999</div>
        </div>
        <p>If all values are numbers, the variable is automatically exported as numeric type.</p>
        <HelpButton topic="nominal-and-ordinal#numeric-values">More about numeric values</HelpButton>
      </PopoverContent>
    </Popover>
  );
}
