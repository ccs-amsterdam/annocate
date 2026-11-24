import { Button } from "@/components/ui/button";
import { buildSkipValue } from "./answerValue";
import type { AnswerFieldProps } from "./types";

/** A question of a type this version of the app has no answer field for: the coder can only skip it. */
export function UnsupportedAnswerField({ onAnswer }: AnswerFieldProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This question can&apos;t be shown here. Skip it to go on, and please tell the researchers.
      </p>
      <Button type="button" variant="outline" onClick={() => onAnswer(buildSkipValue())}>
        Skip
      </Button>
    </div>
  );
}
