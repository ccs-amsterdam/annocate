import { useState } from "react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TypeCard } from "./typeCardData";

/** The kinds as a grid of cards: icon, name and one line each. */
export function TypeCardGrid<T extends string>({
  cards,
  value,
  onPick,
}: {
  cards: TypeCard<T>[];
  value?: T;
  onPick: (type: T) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="listbox" aria-label="Types">
      {cards.map(({ type, label, description, icon: Icon }) => (
        <button
          key={type}
          type="button"
          role="option"
          aria-selected={value === type}
          onClick={() => onPick(type)}
          className={cn(
            "flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-wood/50 hover:bg-wood/5",
            value === type && "border-wood/60 bg-wood/10",
          )}
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-foreground">{label}</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">{description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The chosen kind as a small header, with "Change type" opening the cards
 * (only when there is more than one to choose from).
 */
export function TypeHeader<T extends string>({
  cards,
  value,
  onPick,
  help,
}: {
  cards: TypeCard<T>[];
  value: T;
  onPick: (type: T) => void;
  help?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const card = cards.find((c) => c.type === value);
  const Icon = card?.icon;
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="text-xs font-semibold text-foreground">{card?.label ?? value}</span>
      {help}
      {cards.length > 1 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ml-auto cursor-pointer text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Change type
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(32rem,calc(100vw-2rem))] p-2">
            <TypeCardGrid
              cards={cards}
              value={value}
              onPick={(type) => {
                setOpen(false);
                onPick(type);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
