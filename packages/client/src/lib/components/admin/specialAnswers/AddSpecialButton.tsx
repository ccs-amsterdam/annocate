import { useState } from "react";
import { SPECIAL_NAMES, type SpecialAnswer, type SpecialKind } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { specialBadge } from "../../../keyboard/commands";

/** The kinds in the order the menu shows them. */
const MENU_ORDER: SpecialKind[] = ["dont_know", "not_applicable"];

/**
 * "+ Add special option", next to "+ Add option": adds don't know or not
 * applicable. One kind left: a click adds it; both: a small menu. None left:
 * nothing shown.
 */
export function AddSpecialButton({
  specials,
  onChange,
}: {
  specials: SpecialAnswer[];
  onChange: (specials: SpecialAnswer[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const left = MENU_ORDER.filter((kind) => !specials.some((s) => s.kind === kind));
  if (!left.length) return null;
  const add = (kind: SpecialKind) => {
    onChange([...specials, { kind }]);
    setOpen(false);
  };
  const button = (
    <Button type="button" variant="outline" size="sm" onClick={left.length === 1 ? () => add(left[0]!) : undefined}>
      + Add special option
    </Button>
  );
  return (
    <span className="flex items-center gap-1">
      {left.length === 1 ? (
        button
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
          <PopoverContent align="start" className="flex w-52 flex-col p-1">
            {left.map((kind) => (
              <SpecialMenuItem key={kind} kind={kind} onPick={() => add(kind)} />
            ))}
          </PopoverContent>
        </Popover>
      )}
      <InfoTip label="About special options">
        Answers outside the options: don&apos;t know and not applicable, with your own label. Without a code the answer
        is stored as missing. Coders choose them with the keys / 8 and / 9; with several answers allowed, one is the
        only answer; on a scale every item has them.
      </InfoTip>
    </span>
  );
}

function SpecialMenuItem({ kind, onPick }: { kind: SpecialKind; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      {SPECIAL_NAMES[kind]}
      <kbd className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
        {specialBadge(kind)}
      </kbd>
    </button>
  );
}
