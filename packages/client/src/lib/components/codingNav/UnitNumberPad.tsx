import { Delete } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/** A key of the number pad: a digit, `back` (delete a digit) or `go`. */
export type PadKey = string;

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const padButton = "h-8 w-12 cursor-pointer";

/** A number pad to go to a unit by its number, among the units the coder reached. */
export function UnitNumberPad({
  typed,
  reached,
  onPress,
}: {
  /** The number typed so far ("" while empty). */
  typed: string;
  /** The furthest unit the coder reached: as far as they can go. */
  reached: number;
  onPress: (key: PadKey) => void;
}) {
  const tooFar = Number(typed) > reached;
  return (
    <div className="flex flex-col items-center gap-1.5 border-t border-border/60 p-2">
      <div className="grid grid-cols-3 gap-1">
        {DIGITS.map((digit) => (
          <DigitButton key={digit} digit={digit} onPress={onPress} />
        ))}
        <Button
          type="button"
          variant="outline"
          className={padButton}
          onClick={() => onPress("back")}
          aria-label="Delete a digit"
        >
          <Delete className="h-4 w-4" />
        </Button>
        <DigitButton digit="0" onPress={onPress} />
        <Button type="button" className={cn(padButton, "text-xs")} disabled={!typed} onClick={() => onPress("go")}>
          Go
        </Button>
      </div>
      <p className={cn("text-[11px]", tooFar ? "text-foreground" : "text-muted-foreground")}>
        {tooFar ? `You can go up to unit ${reached}` : `Units 1 to ${reached} (the furthest you reached)`}
      </p>
    </div>
  );
}

function DigitButton({ digit, onPress }: { digit: string; onPress: (key: PadKey) => void }) {
  return (
    <Button type="button" variant="outline" className={cn(padButton, "font-mono")} onClick={() => onPress(digit)}>
      {digit}
    </Button>
  );
}
