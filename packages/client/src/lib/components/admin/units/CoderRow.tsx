import { useState } from "react";
import { UserMinus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { parseToCode } from "../../../admin/unitsTable";

const step = "h-7 rounded-md border border-border px-1.5 text-xs tabular-nums hover:bg-muted disabled:opacity-40";

/** A coder of the coder set: their name (until they start), what they coded, and how many units they still have to code. */
export function CoderRow({
  coder,
  coded,
  toCode,
  unassigned,
  started,
  canHandOver,
  onRename,
  onTarget,
  onHandOver,
}: {
  coder: string;
  coded: number;
  toCode: number;
  /** How many units no coder has. */
  unassigned: number;
  /** They started coding: their name is how their work is kept. */
  started: boolean;
  /** There are other coders to hand their units to. */
  canHandOver: boolean;
  /** A new name was typed (the dialog refuses an empty or taken one). */
  onRename: (to: string) => void;
  /** How many units they have to code. */
  onTarget: (target: number) => void;
  /** Hands their units they haven't coded to the other coders. */
  onHandOver: () => void;
}) {
  const most = toCode + unassigned;
  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-2">
        <CoderName coder={coder} started={started} onRename={onRename} />
      </td>
      <td className="py-1.5 text-right tabular-nums">{coded}</td>
      <td className="py-1.5 pl-4">
        <div className="flex flex-wrap items-center gap-1">
          <ToCodeInput coder={coder} value={toCode} most={most} onChange={onTarget} />
          <button type="button" className={step} onClick={() => onTarget(0)}>
            0
          </button>
          <button type="button" className={step} disabled={toCode === 0} onClick={() => onTarget(toCode - 10)}>
            −10
          </button>
          <button type="button" className={step} disabled={unassigned === 0} onClick={() => onTarget(toCode + 10)}>
            +10
          </button>
          {unassigned > 0 && (
            <button
              type="button"
              className={step}
              title="Give them all unassigned units"
              onClick={() => onTarget(most)}
            >
              +{unassigned}
            </button>
          )}
          <button
            type="button"
            aria-label={`Hand ${coder}'s units to the other coders`}
            title="Hand their units they haven't coded to the other coders"
            disabled={!canHandOver || toCode === 0}
            onClick={onHandOver}
            className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <UserMinus className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** The coder's name: what is typed applies when the field is left or on Enter. */
function CoderName({ coder, started, onRename }: { coder: string; started: boolean; onRename: (to: string) => void }) {
  // The name being typed; null: the name as it is
  const [typed, setTyped] = useState<string | null>(null);
  const apply = () => {
    setTyped(null);
    if (typed !== null) onRename(typed);
  };
  return (
    <Input
      aria-label={`Name of ${coder}`}
      value={typed ?? coder}
      disabled={started}
      title={started ? "Started coding: their name is how their work is kept" : undefined}
      onChange={(e) => setTyped(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => e.key === "Enter" && apply()}
      className="h-8 font-mono text-xs"
    />
  );
}

/**
 * How many units a coder has to code. What is typed applies when the field
 * is left or on Enter, not per keystroke: clearing the field to type another
 * number would set 0 and drop the coder's units.
 */
function ToCodeInput({
  coder,
  value,
  most,
  onChange,
}: {
  coder: string;
  value: number;
  /** The most they can get: theirs and the unassigned units. */
  most: number;
  onChange: (target: number) => void;
}) {
  // What is being typed; null: the value as it is
  const [typed, setTyped] = useState<string | null>(null);
  const apply = () => {
    const target = typed === null ? null : parseToCode(typed, most);
    setTyped(null);
    if (target !== null && target !== value) onChange(target);
  };
  return (
    <Input
      type="number"
      aria-label={`Units ${coder} has to code`}
      min={0}
      max={most}
      value={typed ?? value}
      onChange={(e) => setTyped(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => e.key === "Enter" && apply()}
      className="h-8 w-20 tabular-nums"
    />
  );
}
