import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from "lucide-react";
import { SWIPE_DIRECTIONS, type Option } from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "../ColorPicker";
import { RowButton } from "./RowButton";

const DIRECTION_ICONS = { left: ArrowLeft, right: ArrowRight, up: ArrowUp };

export interface OptionRowProps<T extends Option> {
  option: T;
  index: number;
  /** The last option: it can't move down. */
  last: boolean;
  /** A swipe option: its direction instead of its number. */
  swipe?: boolean;
  ordinal: boolean;
  /** The value is the option's place (1..n): it can't be edited. */
  valuesFollowOrder: boolean;
  /** Extra columns, before the buttons. */
  extra?: React.ReactNode;
  onLabel: (label: string) => void;
  onPatch: (patch: Partial<T>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}

/** One option: its number (or swipe direction), label, value, colour, and the buttons to move and remove it. */
export function OptionRow<T extends Option>(props: OptionRowProps<T>) {
  const { option, index, onPatch } = props;
  return (
    <>
      <span data-option-row={index} className="flex w-5 justify-center">
        {props.swipe ? <SwipeDirection index={index} /> : index + 1}
      </span>
      <Input
        data-option-row={index}
        placeholder={String(option.value) || "label"}
        value={option.label ?? ""}
        onChange={(e) => props.onLabel(e.target.value)}
        className="h-8 text-xs"
      />
      <ValueInput
        index={index}
        value={option.value}
        ordinal={props.ordinal}
        followsOrder={props.valuesFollowOrder}
        onChange={(value) => onPatch({ value } as Partial<T>)}
      />
      <ColorPicker
        label={`Colour of ${option.label || String(option.value) || "this option"}`}
        value={option.color}
        onChange={(color) => onPatch({ color } as Partial<T>)}
      />
      <span data-option-row={index} className="flex items-center">
        {props.extra}
        <RowButton icon={ArrowUp} label="Move up" disabled={index === 0} onClick={() => props.onMove(-1)} />
        <RowButton icon={ArrowDown} label="Move down" disabled={props.last} onClick={() => props.onMove(1)} />
        <RowButton icon={X} label="Remove option" onClick={props.onRemove} />
      </span>
    </>
  );
}

/** Where the option at this place is swiped to (1st left, 2nd right, 3rd up). */
function SwipeDirection({ index }: { index: number }) {
  const Direction = DIRECTION_ICONS[SWIPE_DIRECTIONS[index]];
  return <Direction className="size-4 text-foreground" aria-label={`swipe ${SWIPE_DIRECTIONS[index]}`} />;
}

/** The stored value: text for nominal options, a number for ordinal ones (read-only while it follows the order). */
function ValueInput({
  index,
  value,
  ordinal,
  followsOrder,
  onChange,
}: {
  index: number;
  value: Option["value"];
  ordinal: boolean;
  followsOrder: boolean;
  onChange: (value: string | number) => void;
}) {
  const typed = (text: string) => (ordinal ? Number(text) : text);
  return (
    <Input
      data-option-row={index}
      placeholder="value"
      type={ordinal ? "number" : "text"}
      value={String(value)}
      readOnly={followsOrder}
      tabIndex={followsOrder ? -1 : undefined}
      title={followsOrder ? "Follows the order of the options (check Custom values to set it)" : undefined}
      onChange={(e) => onChange(typed(e.target.value))}
      className={`h-8 font-mono text-xs ${followsOrder ? "bg-muted/40 text-muted-foreground" : ""}`}
    />
  );
}
