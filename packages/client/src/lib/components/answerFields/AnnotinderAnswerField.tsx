import { useEffect } from "react";
import { optionLabel, SWIPE_DIRECTIONS, type NominalOption } from "@annotinder/contracts";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildValues } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type AnnotinderVariable = Extract<QuestionVariable, { type: "annotinder" }>;
type Direction = "left" | "right" | "up";

interface DirectionOption {
  direction: Direction;
  option: NominalOption;
  label: string;
}

/** The options in order: left, right, up. */
function getDirectionOptions(variable: AnnotinderVariable): DirectionOption[] {
  return variable.options.slice(0, 3).map((option, index) => {
    const direction = SWIPE_DIRECTIONS[index];
    return { direction, option, label: `Swipe ${direction}` };
  });
}

function getDirectionIcon(direction: Direction) {
  if (direction === "left") return <ArrowLeft className="size-5" />;
  if (direction === "right") return <ArrowRight className="size-5" />;
  return <ArrowUp className="size-5" />;
}

export function AnnotinderAnswerField({ variable, onAnswer }: AnswerFieldProps<AnnotinderVariable>) {
  const directionOptions = getDirectionOptions(variable);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const direction =
        event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : event.key === "ArrowUp" ? "up" : null;
      if (!direction) return;

      const nextOption = directionOptions.find((option) => option.direction === direction);
      if (!nextOption) return;

      event.preventDefault();
      onAnswer(buildValues([{ value: nextOption.option.value }]));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [directionOptions, onAnswer]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Use the arrow keys or tap a direction to choose a response.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {directionOptions.map((option) => (
          <Button
            key={option.direction}
            type="button"
            variant="outline"
            className="h-auto min-h-24 flex-col gap-3 whitespace-normal px-4 py-4"
            style={option.option.color ? { borderColor: option.option.color, color: option.option.color } : undefined}
            onClick={() => onAnswer(buildValues([{ value: option.option.value }]))}
          >
            {getDirectionIcon(option.direction)}
            <span className="text-center">
              <span className="block text-xs uppercase tracking-wide opacity-70">{option.label}</span>
              <span className="block font-medium">{optionLabel(option.option)}</span>
            </span>
          </Button>
        ))}
      </div>
      {/* TODO: replace this directional-button fallback with a swipe-card gesture UI (as in the old app). */}
    </div>
  );
}
