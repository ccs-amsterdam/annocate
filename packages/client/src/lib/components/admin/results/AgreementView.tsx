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

/** Each coder's agreement with the others on one question, lowest first (who to look at); or kappa per pair. */
function CoderTable({ question }: { question: QuestionAgreement }) {
  const [matrix, setMatrix] = useState(false);
  if (question.coders.length === 0)
    return <p className="text-xs text-muted-foreground">No coder shares units with another yet.</p>;
  const coders = [...question.coders].sort((a, b) => (a.kappa ?? 2) - (b.kappa ?? 2));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Agreement view">
        {(
          [
            [false, "Per coder"],
            [true, "Kappa per pair"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={matrix === value}
            onClick={() => setMatrix(value)}
            className={cn(
              "cursor-pointer rounded px-2 py-0.5 text-xs",
              matrix === value
                ? "bg-wood/15 font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {matrix ? <PairMatrix question={question} /> : <CoderRows coders={coders} />}
    </div>
  );
}

function CoderRows({ coders }: { coders: QuestionAgreement["coders"] }) {
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
          <th
            scope="col"
            className="py-1 text-right font-medium"
            title="Cohen's kappa is for pairs of coders: this is the average of the coder's kappa with each other coder, weighed by the units they share"
          >
            Mean kappa
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

/** At most this many coders in the matrix: beyond that it can't be read. */
const MATRIX_CODERS = 10;

/**
 * Cohen's kappa per pair of coders, as a matrix: at most ten coders (the
 * ones with the lowest mean kappa first); others can be added, which drops
 * the first chosen.
 */
function PairMatrix({ question }: { question: QuestionAgreement }) {
  const all = [...question.coders].sort((a, b) => (a.kappa ?? 2) - (b.kappa ?? 2));
  const [chosen, setChosen] = useState<number[]>(() => all.slice(0, MATRIX_CODERS).map((c) => c.sessionId));
  const nameOf = (id: number) => all.find((c) => c.sessionId === id)?.coder ?? `Session ${id}`;
  const pair = (x: number, y: number) =>
    question.pairs.find((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));
  const others = all.filter((c) => !chosen.includes(c.sessionId));
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th />
              {chosen.map((id) => (
                <th
                  key={id}
                  scope="col"
                  className="max-w-24 truncate px-1.5 py-1 text-right font-medium"
                  title={nameOf(id)}
                >
                  {nameOf(id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chosen.map((row) => (
              <tr key={row}>
                <th scope="row" className="max-w-32 truncate py-1 pr-2 text-left font-medium" title={nameOf(row)}>
                  {nameOf(row)}
                </th>
                {chosen.map((col) => {
                  const p = row === col ? undefined : pair(row, col);
                  return (
                    <td
                      key={col}
                      className={cn(
                        "px-1.5 py-1 text-right tabular-nums",
                        p ? alphaClass(p.kappa) : "text-muted-foreground",
                      )}
                      title={p ? `${p.units} shared units, ${percent(p.percent)} the same` : undefined}
                    >
                      {row === col ? "" : p ? fixed(p.kappa) : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Hover a cell for the units the pair shares; · : no units in common.
      </p>
      {others.length > 0 && (
        <label className="flex items-center gap-2 text-xs">
          Add a coder
          <select
            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              // At most ten: adding one drops the first chosen
              setChosen((now) => [...now, id].slice(-MATRIX_CODERS));
            }}
          >
            <option value="">Choose…</option>
            {others.map((c) => (
              <option key={c.sessionId} value={c.sessionId}>
                {c.coder ?? `Session ${c.sessionId}`}
              </option>
            ))}
          </select>
          {chosen.length >= MATRIX_CODERS && (
            <span className="text-muted-foreground">(at most ten: replaces the first)</span>
          )}
        </label>
      )}
    </div>
  );
}
