import { useEffect, useMemo, useState } from "react";
import {
  buildScope,
  parseAnswerKey,
  TEST_SET,
  unitScopeData,
  type UnitLayout,
  type UnitResponse,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { renderTemplate, type RenderedTemplate } from "../../../codebook/renderTemplate";
import { UnitFields } from "../../UnitFields";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnswerInput, type AnswerKeyQuestion } from "./answerKey/AnswerInput";
import { UnitPager } from "./answerKey/UnitPager";
import { useAnswerKeyUnits } from "./answerKey/useAnswerKeyUnits";

export type { AnswerKeyQuestion };

// "Right answers" (docs/architecture.md §6.2): goes through the gold or
// practice units (`test_set`) with the loop's layout, and writes the right
// answers (`answer_<q>`) and practice feedback (`feedback_<q>`) into their
// columns (contracts answerKey.ts for the cells).

export function AnswerKeyDialog({
  client,
  group,
  set,
  what,
  questions,
  column,
  messageColumn,
  layout,
  onClose,
}: {
  client: ResearcherApi;
  group: string;
  set: string;
  /** "gold" or "practice": in texts. */
  what: string;
  questions: AnswerKeyQuestion[];
  column: (question: string) => string;
  /** Practice: the column of a unit's own feedback per question. */
  messageColumn?: (question: string) => string;
  layout: UnitLayout;
  onClose: () => void;
}) {
  const key = useAnswerKeyUnits(client, group, set);
  const { units, cell, setCell } = key;
  const [index, setIndex] = useState(0);
  const unit = units?.[index];
  const rendered = useUnitAsSeen(unit, layout, questions, group, set);

  const done = (u: UnitResponse) => questions.every((q) => parseAnswerKey(cell(u, column(q.name))) !== null);
  const ready = units?.filter(done).length ?? 0;
  const save = async () => {
    if (await key.save()) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Right answers of the {what} units</DialogTitle>
          <DialogDescription>
            The units marked {set} in test_set:{" "}
            {units ? `${ready} of ${units.length} have answers for every checked question` : "loading…"}. Coders never
            see these columns.
          </DialogDescription>
        </DialogHeader>
        {units && units.length === 0 && (
          <p className="text-sm">No units are marked {set} in test_set yet: mark them on the Units page.</p>
        )}
        {units && unit && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <UnitPager
              index={index}
              count={units.length}
              externalId={unit.externalId}
              answered={done(unit)}
              onIndexChange={setIndex}
            />
            <div className="max-h-72 overflow-y-auto rounded-md border border-border p-3">
              {rendered ? (
                <UnitFields layout={layout} rendered={rendered} />
              ) : (
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(unit.data, null, 2)}</pre>
              )}
            </div>
            {questions.map((q) => (
              <div key={q.name} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <span className="text-xs font-semibold">
                  {"question" in q.variable && q.variable.question ? q.variable.question : q.name}{" "}
                  <span className="font-normal text-muted-foreground">({column(q.name)})</span>
                </span>
                <AnswerInput
                  question={q}
                  cell={cell(unit, column(q.name))}
                  onChange={(v) => setCell(unit, column(q.name), v)}
                />
                {messageColumn && (
                  <Textarea
                    aria-label={`${q.name}: message when wrong`}
                    className="text-xs"
                    placeholder="Message when wrong (optional; default: the loop's message, or the expected answer)"
                    value={cell(unit, messageColumn(q.name))}
                    onChange={(e) => setCell(unit, messageColumn(q.name), e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {key.error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{key.error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={key.saving || key.changed === 0} onClick={() => void save()}>
            Save {key.changed > 0 ? `${key.changed} unit${key.changed === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The unit through the loop's layout, as coders see it (`$unit.test_set` is the set the dialog goes through); null until rendered. */
function useUnitAsSeen(
  unit: UnitResponse | undefined,
  layout: UnitLayout,
  questions: AnswerKeyQuestion[],
  group: string,
  set: string,
): RenderedTemplate | null {
  const [rendered, setRendered] = useState<RenderedTemplate | null>(null);
  const questionMap = useMemo(() => new Map(questions.map((q) => [q.name, q.variable])), [questions]);
  useEffect(() => {
    if (!unit) return;
    let cancelled = false;
    const data = { ...unitScopeData(unit), ...(group === TEST_SET ? { test_set: set } : {}) };
    renderTemplate(layout.template, buildScope(questionMap, {}, data), undefined, "answer-key", {
      snippets: layout.snippets,
    }).then(
      (r) => !cancelled && setRendered(r),
      () => !cancelled && setRendered(null),
    );
    return () => {
      cancelled = true;
    };
  }, [unit, layout, questionMap, group, set]);
  return rendered;
}
