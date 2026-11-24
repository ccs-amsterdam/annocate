import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Which unit of the set is shown, with the previous and the next, and whether it has its answers. */
export function UnitPager({
  index,
  count,
  externalId,
  answered,
  onIndexChange,
}: {
  index: number;
  count: number;
  externalId: string;
  /** The unit has an answer for every checked question. */
  answered: boolean;
  onIndexChange: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous unit"
        disabled={index === 0}
        onClick={() => onIndexChange(index - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span>
        Unit {index + 1} of {count}: <span className="font-mono">{externalId}</span>
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next unit"
        disabled={index === count - 1}
        onClick={() => onIndexChange(index + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className={answered ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
        {answered ? "answered" : "missing answers"}
      </span>
    </div>
  );
}
