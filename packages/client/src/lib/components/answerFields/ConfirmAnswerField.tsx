import type { AnswerFieldProps, QuestionVariable } from "./types";
import { Button } from "@/components/ui/button";

type ConfirmVariable = Extract<QuestionVariable, { type: "confirm" }>;

export function ConfirmAnswerField({ onAnswer }: AnswerFieldProps<ConfirmVariable>) {
  return (
    <div className="flex justify-center pt-2">
      <Button className="min-w-40" size="lg" onClick={() => onAnswer({ done: true, skip: false }, true)}>
        I confirm
      </Button>
    </div>
  );
}
