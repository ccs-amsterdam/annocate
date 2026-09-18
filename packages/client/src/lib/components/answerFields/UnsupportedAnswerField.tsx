import { Button } from "@/components/ui/button";
import { buildSkipValue } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";

interface UnsupportedAnswerFieldProps extends AnswerFieldProps {
  variable: QuestionVariable;
}

export function UnsupportedAnswerField({ variable, onAnswer }: UnsupportedAnswerFieldProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Variable type &quot;{variable.type}&quot; does not have a dedicated Phase 4.1 renderer yet.
      </p>
      <Button type="button" variant="outline" onClick={() => onAnswer(buildSkipValue())}>
        Skip
      </Button>
    </div>
  );
}
