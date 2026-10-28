import { useMemo, useState } from "react";
import { collectQuestions, loopTitle, unitLoops, type TopLevelItem } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCodebookQuery, useDeploymentQuery, useResetAnswersMutation } from "../../admin/queries";
import { HelpButton } from "../../help/HelpButton";

/** Whose or which answers to reset: some coders, some units, or (neither) everyone's. */
export interface ResetScope {
  coderIds?: number[];
  unitIds?: number[];
  /** How the scope is described, e.g. "coder P12" or "3 units". */
  label: string;
}

/**
 * Resetting answers (docs/architecture.md §8.2): the chosen questions'
 * live answers in unit loops are retired, so those units are coded again
 * (also by the same coders, who see them unanswered). The old answers are
 * kept as reset (the API's `retired=true`, and the download's
 * reset_answers.csv).
 */
export function ResetAnswersDialog({ client, scope, onClose }: { client: ResearcherApi; scope: ResetScope | null; onClose: () => void }) {
  const deployment = useDeploymentQuery(client).data;
  const codebook = useCodebookQuery(client, deployment?.codebookId ?? null).data;
  const reset = useResetAnswersMutation(client);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  // The live codebook's loop questions, per loop (only answers in loops can be reset).
  const loops = useMemo(() => {
    const items = (codebook?.items ?? []) as TopLevelItem[];
    const { loopOf } = collectQuestions(items);
    return unitLoops(items).map(({ key, loop }) => ({
      key,
      title: loopTitle(loop, key),
      questions: [...loopOf].filter(([, l]) => l === key).map(([name]) => name),
    }));
  }, [codebook]);

  const close = () => {
    setChosen(new Set());
    reset.reset();
    onClose();
  };
  const toggle = (names: string[], on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      for (const n of names) if (on) next.add(n);
      else next.delete(n);
      return next;
    });

  return (
    <Dialog open={scope !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            Reset answers{scope?.label ? ` of ${scope.label}` : ""}
            <HelpButton topic="changing-a-live-codebook#resetting-answers" label="Help: resetting answers" />
          </DialogTitle>
          <DialogDescription>
            The answers to the questions you choose become unanswered, so these units are coded again. The old answers are kept
            as reset answers, apart from the live ones.
          </DialogDescription>
        </DialogHeader>
        {reset.isSuccess ? (
          <p className="text-sm">
            {reset.data.retired} answer{reset.data.retired === 1 ? "" : "s"} reset.
          </p>
        ) : !deployment ? (
          <p className="text-sm text-muted-foreground">Nothing is live yet: there are no answers to reset.</p>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto text-sm">
            {loops.map((l) => (
              <fieldset key={l.key} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={l.questions.length > 0 && l.questions.every((q) => chosen.has(q))}
                    onChange={(e) => toggle(l.questions, e.target.checked)}
                  />
                  {l.title}: all questions
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
                  {l.questions.map((q) => (
                    <label key={q} className="flex items-center gap-1.5 font-mono text-xs">
                      <input type="checkbox" checked={chosen.has(q)} onChange={(e) => toggle([q], e.target.checked)} />
                      {q}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {loops.length === 0 && <p className="text-muted-foreground">The live codebook has no unit loops: there is nothing to reset.</p>}
          </div>
        )}
        {reset.error && <p className="text-sm text-destructive">{reset.error.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {reset.isSuccess ? "Close" : "Cancel"}
          </Button>
          {!reset.isSuccess && (
            <Button
              variant="destructive"
              disabled={chosen.size === 0 || reset.isPending}
              onClick={() =>
                reset.mutate({
                  variables: [...chosen],
                  ...(scope?.coderIds ? { coderIds: scope.coderIds } : {}),
                  ...(scope?.unitIds ? { unitIds: scope.unitIds } : {}),
                })
              }
            >
              Reset {chosen.size || ""} question{chosen.size === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
