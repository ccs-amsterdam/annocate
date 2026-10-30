import { useEffect } from "react";
import { optionLabel, SWIPE_DIRECTIONS, type NominalOption } from "@annotinder/contracts";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildValues } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { useSwipe, type SwipeDirection } from "../SwipeCard";

type AnnotinderVariable = Extract<QuestionVariable, { type: "annotinder" }>;

const ICONS = { left: ArrowLeft, right: ArrowRight, up: ArrowUp };
/** Arrow keys, and 1, 2, 3 for the 1st, 2nd and 3rd option. */
const KEYS: Record<string, SwipeDirection> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", "1": "left", "2": "right", "3": "up" };

/**
 * A swipe question: the card (the unit, see `SwipeCard`) is swiped left,
 * right or up for the 1st, 2nd and 3rd option, from anywhere on the screen.
 * The buttons, the arrow keys and 1, 2, 3 do the same; with a card they fly
 * it off first.
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const direction = KEYS[event.key];
      if (!direction || !options[SWIPE_DIRECTIONS.indexOf(direction)]) return;
      event.preventDefault();
      choose(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Left on the left, right on the right, up in the middle.
  const [left, right, up] = options;
  const buttons: [SwipeDirection, NominalOption | undefined][] = [
    ["left", left],
    ["up", up],
    ["right", right],
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        {buttons.map(([direction, option]) => {
          if (!option) return null;
          const Icon = ICONS[direction];
          return (
            <Button
              key={direction}
              type="button"
              variant="outline"
              aria-label={`${optionLabel(option)} (swipe ${direction})`}
              className={`h-10 min-w-0 flex-1 gap-1.5 px-2 ${direction === "right" ? "flex-row-reverse" : ""}`}
              style={option.color ? { borderColor: option.color, color: option.color } : undefined}
              onClick={() => choose(direction)}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate font-medium">{optionLabel(option)}</span>
            </Button>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        {swipe ? "Swipe, use the arrow keys or 1, 2, 3, or tap." : "Use the arrow keys or 1, 2, 3, or tap."}
      </p>
    </div>
  );
}
