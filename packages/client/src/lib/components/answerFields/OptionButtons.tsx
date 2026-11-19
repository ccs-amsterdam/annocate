import type { CSSProperties } from "react";
import { optionLabel, type Option } from "@annotinder/contracts";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCodeButtonStyle } from "../../utils/color";
import { useCoderSettings } from "../../context/coderSettings";
import { ShortcutBadge } from "../ShortcutBadge";

// Buttons for the options of a question (docs/client.md §4): tight, about
// 40 px tall, so a question fits half a small phone screen.

interface OptionButtonProps {
  option: Option;
  selected: boolean;
  shortcut?: number;
  /** Show a check when selected (questions with several answers). */
  check?: boolean;
  onClick: () => void;
}

export function OptionButton({ option, selected, shortcut, check, onClick }: OptionButtonProps) {
  const { theme } = useCoderSettings();
  const customStyle = getCodeButtonStyle(option.color, selected, theme === "dark");
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      className={`relative h-auto min-h-10 justify-center gap-1.5 whitespace-normal px-3 py-1.5 text-sm leading-snug ${
        customStyle ? "" : selected ? "border-primary" : "border-border hover:bg-muted/50"
      }`}
      style={customStyle}
      onClick={onClick}
    >
      {shortcut !== undefined && shortcut < 9 && <ShortcutBadge shortcut={String(shortcut + 1)} />}
      <span className="min-w-0 break-words">{optionLabel(option)}</span>
      {check && selected && <Check className="size-3.5 shrink-0" />}
    </Button>
  );
}

/** Uncoloured options get a primary-colour gradient from the first to the last point of an ordinal scale. */
function gradientStyle(index: number, count: number): CSSProperties {
  const pct = count > 1 ? Math.round(30 + (70 * index) / (count - 1)) : 100;
  return { backgroundColor: `color-mix(in srgb, var(--primary) ${pct}%, transparent)` };
}

interface CompactRowProps {
  options: Option[];
  selected: Option["value"] | undefined;
  onSelect: (option: Option) => void;
  label?: string;
}

/**
 * One row of ordinal options that only show their value; the selected one
 * grows and shows its label. Used by ordinal questions and scale items.
 */
export function CompactRow({ options, selected, onSelect, label }: CompactRowProps) {
  const { theme } = useCoderSettings();
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full gap-1">
      {options.map((option, index) => {
        const isCurrent = selected === option.value;
        const colorStyle = getCodeButtonStyle(option.color, isCurrent, theme === "dark");
        const style = colorStyle ?? (isCurrent ? undefined : gradientStyle(index, options.length));
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            title={optionLabel(option)}
            aria-label={optionLabel(option)}
            aria-checked={isCurrent}
            onClick={() => onSelect(option)}
            style={style}
            className={`h-9 min-w-0 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-transparent px-1 text-sm font-bold text-foreground transition-all duration-200 ${
              isCurrent
                ? `flex-[3_1_auto] px-3 ${colorStyle ? "" : "bg-secondary text-secondary-foreground dark:bg-foreground dark:text-background"} ring-2 ring-primary ring-offset-1 ring-offset-background`
                : "flex-1 basis-0 hover:brightness-110"
            }`}
          >
            {isCurrent ? optionLabel(option) : String(option.value)}
          </button>
        );
      })}
    </div>
  );
}

/** The labels of the first and last ordinal option, above a compact row. */
export function EndLabels({ options }: { options: Option[] }) {
  if (options.length < 2) return null;
  return (
    <div className="flex justify-between gap-4 px-1 text-xs text-muted-foreground">
      <span className="max-w-[45%]">{optionLabel(options[0])}</span>
      <span className="max-w-[45%] text-right">{optionLabel(options[options.length - 1])}</span>
    </div>
  );
}
