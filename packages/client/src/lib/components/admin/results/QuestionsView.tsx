import type { QuestionAnswers } from "@annotinder/contracts";
import type { DesignLabels } from "./designLabels";

/** Per question, how coders answered so far (docs/plans/results-viewer.md, "Questions"), grouped by block. */
export function QuestionsView({ questions, labels }: { questions: QuestionAnswers[]; labels: DesignLabels }) {
  if (questions.length === 0) return <p className="text-sm text-muted-foreground">No questions deployed yet.</p>;
  const loops = [...new Set(questions.map((q) => q.loop))];
  return (
    <div className="flex flex-col gap-6">
      {loops.map((loop) => (
        <section key={loop ?? "top"} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{labels.loopTitle(loop)}</h3>
          {questions
            .filter((q) => q.loop === loop)
            .map((q) => (
              <QuestionCard key={`${q.question}/${q.item ?? ""}`} answers={q} labels={labels} />
            ))}
        </section>
      ))}
    </div>
  );
}

function QuestionCard({ answers, labels }: { answers: QuestionAnswers; labels: DesignLabels }) {
  const { question, item, type, answered, skipped } = answers;
  const text = labels.questionText(question);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <div className="min-w-0">
          <span className="font-mono text-sm font-medium">{question}</span>
          {item && <span className="text-sm"> · {labels.itemLabel(question, item)}</span>}
          {text && <p className="truncate text-sm text-muted-foreground">{text}</p>}
        </div>
        <span className="text-xs text-muted-foreground">
          {answered} answered{skipped > 0 && `, ${skipped} skipped`}
        </span>
      </div>
      {type === "numeric" ? (
        <NumberSummary answers={answers} />
      ) : (
        type !== "confirm" && <Bars answers={answers} labels={labels} />
      )}
    </div>
  );
}

/** A bar per value: the design's options in order (also those nobody chose), then values the design no longer has. */
function Bars({ answers, labels }: { answers: QuestionAnswers; labels: DesignLabels }) {
  const counts = new Map(answers.counts.map((c) => [c.value, c.count]));
  const values = [...labels.options(answers.question)];
  for (const { value } of answers.counts) if (!values.includes(value)) values.push(value);
  if (values.length === 0) return null;
  const max = Math.max(1, ...counts.values());
  // Spans and relations: several per answer, so counts only; otherwise also the share of answers
  const share = answers.type !== "span" && answers.type !== "relation" && answers.answered > 0;
  return (
    <ul className="flex flex-col gap-1">
      {values.map((value) => {
        const count = counts.get(value) ?? 0;
        return (
          <li key={String(value)} className="grid grid-cols-[minmax(6rem,12rem)_1fr_auto] items-center gap-2 text-sm">
            <span className="truncate" title={String(value)}>
              {labels.valueLabel(answers.question, value)}
            </span>
            <span className="h-2.5 rounded-sm bg-muted" aria-hidden="true">
              <span className="block h-full rounded-sm bg-primary/70" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="text-right text-xs text-muted-foreground tabular-nums">
              {count}
              {share && ` (${Math.round((count / answers.answered) * 100)}%)`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Numbers: the range and the middle, from the counts per value. */
function NumberSummary({ answers }: { answers: QuestionAnswers }) {
  const numbers = answers.counts.flatMap((c) => (typeof c.value === "number" ? [[c.value, c.count] as const] : []));
  if (numbers.length === 0) return null;
  numbers.sort((a, b) => a[0] - b[0]);
  const n = numbers.reduce((sum, [, count]) => sum + count, 0);
  let seen = 0;
  let median = numbers[0][0];
  for (const [value, count] of numbers) {
    seen += count;
    if (seen >= n / 2) {
      median = value;
      break;
    }
  }
  const mean = numbers.reduce((sum, [value, count]) => sum + value * count, 0) / n;
  const stat = (label: string, value: number) => (
    <span>
      <span className="text-muted-foreground">{label}</span> {Number(value.toFixed(2))}
    </span>
  );
  return (
    <p className="flex flex-wrap gap-x-4 text-sm tabular-nums">
      {stat("min", numbers[0][0])}
      {stat("median", median)}
      {stat("mean", mean)}
      {stat("max", numbers[numbers.length - 1][0])}
    </p>
  );
}
