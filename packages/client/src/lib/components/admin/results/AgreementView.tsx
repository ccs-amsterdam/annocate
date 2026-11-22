import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { QuestionAgreement } from "@annotinder/contracts";
import type { DesignLabels } from "./designLabels";
import { cn } from "cn";

const METRICS = { nominal: "categories", ordinal: "ordered", interval: "numbers" } as const;

const fixed = (n: number | null, digits = 2) => (n === null ? "–" : n.toFixed(digits));
const percent = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

/** Krippendorff's rule of thumb: from .8 reliable, from .667 for tentative conclusions. */
function alphaClass(alpha: number | null): string {
  if (alpha === null) return "text-muted-foreground";
  if (alpha >= 0.8) return "text-leaf-strong";
  if (alpha >= 0.667) return "text-foreground";
  return "text-destructive";
}

/**
 * Agreement per unit-loop question so far (docs/plans/results-viewer.md,
 * "Agreement"); a row opens each coder's agreement with the others.
 */
export function AgreementView({ questions, labels }: { questions: QuestionAgreement[]; labels: DesignLabels }) {
  const [open, setOpen] = useState<string | null>(null);
  if (questions.length === 0)
    return <p className="text-sm text-muted-foreground">No questions in unit loops to compare.</p>;
  const loops = [...new Set(questions.map((q) => q.loop))];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Over units two or more coders answered. Krippendorff&apos;s alpha: 1 is full agreement, 0 what chance gives;
        from 0.8 it is commonly taken as reliable, from 0.667 for tentative conclusions. Spans: per label, each word
        labelled or not.
      </p>
      {loops.map((loop) => (
        <section key={loop} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{labels.loopTitle(loop)}</h3>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Question
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Alpha
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Agree
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Units
                  </th>
                </tr>
              </thead>
              <tbody>
                {questions
                  .filter((q) => q.loop === loop)
                  .map((q) => {
                    const key = `${q.question}/${q.item ?? ""}/${q.option ?? ""}`;
                    const expanded = open === key;
                    const Chevron = expanded ? ChevronDown : ChevronRight;
                    return (
                      <Fragment key={key}>
                        <tr className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              onClick={() => setOpen(expanded ? null : key)}
                              className="flex cursor-pointer items-center gap-1 text-left"
                            >
                              <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="font-mono">{q.question}</span>
                              {q.item && <span>· {labels.itemLabel(q.question, q.item)}</span>}
                              {q.option !== null && <span>· {labels.valueLabel(q.question, q.option)}</span>}
                              <span className="text-xs text-muted-foreground">({METRICS[q.metric]})</span>
                            </button>
                          </td>
                          <td className={cn("px-3 py-2 text-right font-medium tabular-nums", alphaClass(q.alpha))}>
                            {fixed(q.alpha)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{percent(q.percent)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{q.units}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-border bg-muted/30">
                            <td colSpan={4} className="px-3 py-2">
                              <CoderTable question={q} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Each coder's agreement with the others on one question, lowest first (who to look at). */
function CoderTable({ question }: { question: QuestionAgreement }) {
  if (question.coders.length === 0)
    return <p className="text-xs text-muted-foreground">No coder shares units with another yet.</p>;
  const coders = [...question.coders].sort((a, b) => (a.kappa ?? 2) - (b.kappa ?? 2));
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th scope="col" className="py-1 font-medium">
            Coder
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Shared units
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Agree
          </th>
          <th scope="col" className="py-1 text-right font-medium" title="Cohen's kappa with each other coder, averaged">
            Kappa
          </th>
        </tr>
      </thead>
      <tbody>
        {coders.map((c) => (
          <tr key={c.sessionId}>
            <td className="py-1">{c.coder ?? `Session ${c.sessionId}`}</td>
            <td className="py-1 text-right tabular-nums">{c.units}</td>
            <td className="py-1 text-right tabular-nums">{percent(c.percent)}</td>
            <td className={cn("py-1 text-right tabular-nums", alphaClass(c.kappa))}>{fixed(c.kappa)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
