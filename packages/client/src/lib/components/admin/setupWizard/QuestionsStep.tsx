import { Textarea } from "@/components/ui/textarea";
import { hasSetGroup, parseQuestions, questionLists } from "../../../admin/setupRecipe";
import { Intro, type StepProps } from "./common";

const LIST_TEXT: Record<"before" | "unit" | "after", { title: string; text: string }> = {
  before: { title: "Questions before the units", text: "Asked once, e.g. consent, age or prior opinions." },
  unit: { title: "Questions about each unit", text: "Asked for every unit a coder gets." },
  after: { title: "Questions after the units", text: "Asked once at the end, e.g. comments." },
};

/** The questions by name, a list per place (before, per unit, after); and gold and practice checks. */
export function QuestionsStep({ answers, set }: StepProps) {
  const lists = questionLists(answers.parts);
  return (
    <>
      <Intro>
        Name the questions you want to ask, one per line: a short name (<code>age</code>) or the question itself (
        <code>How old are you?</code>). You choose each question's answer type (options, a scale, a number, selecting
        text...) in the editor next, where you can also make questions conditional.
      </Intro>
      {lists.map((list) => {
        const names = parseQuestions(answers.questions[list]).map((q) => q.name);
        const heading =
          lists.length === 1
            ? {
                title: list === "unit" ? LIST_TEXT.unit.title : "Questions",
                text: list === "unit" ? LIST_TEXT.unit.text : "Asked once per coder.",
              }
            : LIST_TEXT[list];
        return (
          <label key={list} className="block">
            <span className="text-sm font-medium text-foreground">{heading.title}</span>
            <span className="block text-xs text-muted-foreground">{heading.text}</span>
            <Textarea
              className="mt-1"
              rows={4}
              aria-label={heading.title}
              value={answers.questions[list].join("\n")}
              onChange={(ev) => set({ questions: { ...answers.questions, [list]: ev.target.value.split("\n") } })}
            />
            {names.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {names.map((n, i) => (
                  <code key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {n || "?"}
                  </code>
                ))}
              </span>
            )}
          </label>
        );
      })}
      {answers.parts.annotate && hasSetGroup(answers.distribution) && <ChecksSection answers={answers} set={set} />}
    </>
  );
}

/**
 * Gold and practice checks (docs/architecture.md §6.2): per unit question,
 * whether units with a known answer check it silently (gold) or with
 * feedback (practice), and whether the uploaded units have its answer column.
 */
function ChecksSection({ answers, set }: StepProps) {
  const questions = parseQuestions(answers.questions.unit)
    .map((q) => q.name)
    .filter(Boolean);
  if (questions.length === 0) return null;
  const fields = new Set(answers.units?.fields.map((f) => f.name) ?? []);
  const toggle = (kind: "gold" | "practice", name: string, on: boolean) =>
    set({
      checks: {
        ...answers.checks,
        [kind]: on
          ? [...answers.checks[kind].filter((q) => q !== name), name]
          : answers.checks[kind].filter((q) => q !== name),
      },
    });
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium text-foreground">Units with a known answer (optional)</legend>
      <p className="text-xs text-muted-foreground">
        <strong>Gold</strong> units check coders silently; <strong>practice</strong> units tell them when they were
        wrong. They are the units in the sets <code>_gold</code> and <code>_practice</code> (a sets column with those
        values, or later on the Units page), with the right answer in a column per question. You can write the answers
        later with <strong>Create gold values</strong> in the loop&apos;s Units tab.
      </p>
      <table className="w-fit text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="pr-4 font-medium">Question</th>
            <th className="pr-4 font-medium">Gold</th>
            <th className="pr-4 font-medium">Practice</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q}>
              <td className="pr-4 font-mono">{q}</td>
              {(["gold", "practice"] as const).map((kind) => {
                const column = `${q}_${kind}`;
                const checked = answers.checks[kind].includes(q);
                return (
                  <td key={kind} className="pr-4">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        aria-label={`${kind} ${q}`}
                        checked={checked}
                        onChange={(e) => toggle(kind, q, e.target.checked)}
                      />
                      {checked && (
                        <span
                          className={
                            fields.has(column) ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                          }
                        >
                          {fields.has(column) ? `${column} found` : `no ${column} yet`}
                        </span>
                      )}
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
