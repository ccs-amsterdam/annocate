import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { RenderedTemplate } from "../../codebook/renderTemplate";
import { TemplateMarkdown } from "../TemplateMarkdown";

/**
 * The answer field with what goes around it: the feedback on a wrong
 * practice answer above it (docs/architecture.md §6.2), or for a frozen
 * coder-level answer (units were coded with it) the field read-only with
 * Continue.
 */
export function QuestionPanel({
  answerField,
  practiceWrong,
  onContinueAfterPractice,
  frozen,
  onContinueFrozen,
}: {
  answerField: ReactNode;
  practiceWrong: { messages: RenderedTemplate[]; retry: boolean } | null;
  onContinueAfterPractice: () => void;
  frozen: boolean;
  onContinueFrozen: () => void;
}) {
  if (practiceWrong) {
    return (
      <div className="flex flex-col">
        <div role="alert" className="mx-4 mb-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
          <p className="font-semibold">Not quite</p>
          {practiceWrong.messages.map((m, i) => (
            <TemplateMarkdown key={i} rendered={m} />
          ))}
          {practiceWrong.retry ? (
            <p className="mt-1 text-muted-foreground">This is a practice unit: answer again.</p>
          ) : (
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onContinueAfterPractice}>
              Continue
            </Button>
          )}
        </div>
        {answerField}
      </div>
    );
  }
  if (frozen) {
    return (
      <div className="flex flex-col gap-3">
        <fieldset disabled className="pointer-events-none opacity-60" aria-readonly>
          {answerField}
        </fieldset>
        <p className="px-4 text-sm text-muted-foreground">
          You coded units with this answer, so it can&apos;t be changed any more.
        </p>
        <Button className="mx-4 w-fit" onClick={onContinueFrozen}>
          Continue
        </Button>
      </div>
    );
  }
  return answerField;
}
