import { optionLabel, SWIPE_DIRECTIONS, type NominalOption } from "@annotinder/contracts";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildValues } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { useSwipe, type SwipeDirection } from "../swipe";
import { useKeyTargets } from "../../keyboard/hooks";
import { ShortcutBadge } from "../ShortcutBadge";

type AnnotinderVariable = Extract<QuestionVariable, { type: "annotinder" }>;

const ICONS = { left: ArrowLeft, right: ArrowRight, up: ArrowUp };
/** The arrow key of each direction: it always answers (the mapping's keys too). */
const ARROWS: Record<SwipeDirection, string> = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp" };
/** Where each button is for the numpad: left and right below, up above them (keys 1, 3 and 5). */
const NUMPAD_POSITION: Record<SwipeDirection, { row: number; col: number }> = {
  left: { row: 1, col: 0 },
  right: { row: 1, col: 2 },
  up: { row: 0, col: 1 },
};

/**
 * A swipe question: the card (the unit, see `SwipeCard`) is swiped left,
 * right or up for the 1st, 2nd and 3rd option, from anywhere on the screen.
 * The buttons, the arrow keys and the coder's shortcut style (1, 2, 3,
 * letters, typing to filter) do the same; with a card they fly it off first.
 */
export function AnnotinderAnswerField({ variable, onAnswer }: AnswerFieldProps<AnnotinderVariable>) {
  const swipe = useSwipe();
  const options = variable.options.slice(0, 3);

  const choose = (direction: SwipeDirection) => {
    const option = options[SWIPE_DIRECTIONS.indexOf(direction)];
    if (!option) return;
    if (swipe) swipe.swipe(direction);
    else onAnswer(buildValues([{ value: option.value }]));
  };

  const targets = [
    options.map((o, i) => ({
      label: optionLabel(o),
      keys: [ARROWS[SWIPE_DIRECTIONS[i]]],
      pos: NUMPAD_POSITION[SWIPE_DIRECTIONS[i]],
    })),
  ];
  const keyboard = useKeyTargets(targets, (_, index) => choose(SWIPE_DIRECTIONS[index]), { filterable: true });
  const keys = keyboard.keys[0] ?? [];
  const dimmed = (index: number) => keyboard.filter !== "" && !keyboard.matches[0]?.[index];

  // Left on the left, right on the right, up in the middle.
  const [left, right, up] = options;
  const buttons: [SwipeDirection, NominalOption | undefined][] = [
    ["left", left],
    ["up", up],
    ["right", right],
  ];

  return (
    <div className="flex flex-col gap-1.5">
      {keyboard.filter && (
        <p className="text-center text-xs text-muted-foreground" role="status">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{keyboard.filter}</span> Enter
          chooses the first match, Esc clears
        </p>
      )}
      <div className="flex gap-1.5">
        {buttons.map(([direction, option]) => {
          if (!option) return null;
          const Icon = ICONS[direction];
          const index = SWIPE_DIRECTIONS.indexOf(direction);
          return (
            <Button
              key={direction}
              type="button"
              variant="outline"
              aria-label={`${optionLabel(option)} (swipe ${direction})`}
              className={`relative h-10 min-w-0 flex-1 gap-1.5 px-2 ${direction === "right" ? "flex-row-reverse" : ""} ${dimmed(index) ? "opacity-40" : ""}`}
              // The option's color on the border and arrow; the label stays readable text
              style={option.color ? { borderColor: option.color } : undefined}
              data-key-target=""
              onClick={() => choose(direction)}
            >
              <Icon className="size-4 shrink-0" style={option.color ? { color: option.color } : undefined} />
              <span className="truncate font-medium">{optionLabel(option)}</span>
              {keys[index] && <ShortcutBadge shortcut={keys[index]} />}
            </Button>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        {swipe ? "Swipe, use the arrow keys or the shortcuts, or tap." : "Use the arrow keys or the shortcuts, or tap."}
      </p>
    </div>
  );
}
