import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Marks a coder whose units in the draft aren't the deployed ones; a click says what that means. */
export function DraftMarker({ coder }: { coder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${coder}: the draft assigns different units`}
          className="ml-1.5 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-amber-500/20 align-middle text-[10px] font-bold text-amber-700 hover:bg-amber-500/40 dark:text-amber-400"
        >
          ≠
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 text-xs leading-relaxed text-muted-foreground">
        The draft assigns different units; deploy to apply.
      </PopoverContent>
    </Popover>
  );
}
