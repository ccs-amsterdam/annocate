import { useEffect } from "react";
import type { CodebookCode } from "@annotinder/contracts";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCodeValue } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type AnnotinderVariable = Extract<QuestionVariable, { type: "annotinder" }>;
type Direction = "left" | "right" | "up";

interface DirectionOption {
  direction: Direction;
  code: CodebookCode;
  label: string;
}

function getDirectionOptions(variable: AnnotinderVariable): DirectionOption[] {
  const mapping: Array<{ direction: Direction; label: string }> = [
    { direction: "left", label: "Swipe left" },
    { direction: "right", label: "Swipe right" },
    { direction: "up", label: "Swipe up" },
  ];

  return mapping.flatMap((entry, index) => {
    const code = variable.codes[index];
    return code ? [{ ...entry, code }] : [];
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
      onAnswer(buildCodeValue([{ code: nextOption.code.code, value: nextOption.code.value }]), nextOption.code.code);
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
            style={option.code.color ? { borderColor: option.code.color, color: option.code.color } : undefined}
            onClick={() => onAnswer(buildCodeValue([{ code: option.code.code, value: option.code.value }]), option.code.code)}
          >
            {getDirectionIcon(option.direction)}
            <span className="text-center">
              <span className="block text-xs uppercase tracking-wide opacity-70">{option.label}</span>
              <span className="block font-medium">{option.code.code}</span>
            </span>
          </Button>
        ))}
      </div>
      {/* Future Phase 4.x work can replace this directional-button fallback with the legacy swipe-card gesture UI. */}
    </div>
  );
}
