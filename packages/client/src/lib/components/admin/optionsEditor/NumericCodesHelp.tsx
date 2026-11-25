import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpButton } from "../../../help/HelpButton";

/** For nominal questions (ordinal ones have "Custom values"): values can be numbers, e.g. an existing codebook's codes. */
export function NumericCodesHelp() {
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
