import { X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";
import { standardizeColor } from "../../utils/color";

/** Colours that read well on buttons and highlights, in light and dark mode: by name, so designs read well too. */
const PALETTE = [
  "crimson",
  "darkorange",
  "gold",
  "seagreen",
  "lightseagreen",
  "dodgerblue",
  "slateblue",
  "mediumorchid",
  "hotpink",
  "gray",
];

/**
 * An answer option's colour (docs/client.md §7): a swatch that opens a
 * palette, any colour from the browser's own picker, or none (spans and
 * relations then get one from the value).
 */
export function ColorPicker({
  value,
  onChange,
  label = "Colour",
}: {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
  label?: string;
}) {
  const hex = standardizeColor(value) ?? "#000000";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value ? `${label}: ${value}` : `${label}: none`}
          title={value ?? "No colour"}
          className={cn(
            "h-6 w-6 shrink-0 cursor-pointer rounded-md border border-border/60",
            !value && "bg-[repeating-linear-gradient(45deg,transparent_0_3px,var(--border)_3px_4px)]",
          )}
          style={value ? { backgroundColor: value } : undefined}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={label}>
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              title={color}
              aria-pressed={hex === standardizeColor(color)}
              onClick={() => onChange(color)}
              className={cn(
                "h-6 w-6 cursor-pointer rounded-md border border-border",
                hex === standardizeColor(color) && "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="color"
              aria-label="Any colour"
              value={hex}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
            />
            Other…
          </label>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="ml-auto flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> None
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
