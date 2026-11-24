import { Button } from "@/components/ui/button";
import { COMMAND_BADGES } from "../../keyboard/commands";
import { ShortcutBadge } from "../ShortcutBadge";
import { NumberLabels } from "./NumberLabels";
import type { SliderState } from "./numericKeys";

/** A slider over a closed range, with the value, the labels of break points and Continue. */
export function NumberSlider({ variable, value, setValue, onAnswer }: SliderState) {
  const current = value ?? (variable.min! + variable.max!) / 2;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <input
          type="range"
          className="h-10 flex-1 cursor-pointer accent-primary"
          min={variable.min}
          max={variable.max}
          step={variable.step ?? 1}
          value={current}
          aria-label="Value"
          onChange={(e) => setValue(Number(e.target.value))}
          // A tap on the thumb changes nothing: it chooses the value shown (the middle, at first)
          onClick={(e) => setValue(Number(e.currentTarget.value))}
        />
        <span className={`w-12 text-right font-mono text-sm ${value === null ? "text-muted-foreground" : ""}`}>
          {value ?? "–"}
        </span>
      </div>
      <NumberLabels labels={variable.labels ?? []} min={variable.min!} max={variable.max!} />
      <Button
        type="button"
        className="relative h-10"
        data-key-target=""
        disabled={value === null}
        onClick={() => value !== null && onAnswer(value)}
      >
        Continue
        {value !== null && <ShortcutBadge shortcut={COMMAND_BADGES.continue} />}
      </Button>
    </div>
  );
}
