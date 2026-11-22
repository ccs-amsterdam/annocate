import { parseQuestions, questionLists, type SetupAnswers, type SetupDistribution } from "../../../admin/setupRecipe";

/** Who codes what, in a sentence. */
function distributionSummary(d: SetupDistribution): string {
  const overlap = "overlap" in d && d.overlap ? `, plus overlap units every coder codes` : "";
  switch (d.mode) {
    case "all":
      return "Every coder codes every unit.";
    case "sets":
      return `${d.source === "split" ? `The units in ${d.sets} sets` : `A set per value of ${d.column}`}, one per coder${overlap}; a link per coder.`;
    case "crowd": {
      const until = d.shared.until;
      const coders = d.shared.codersPerUnit?.min ?? 1;
      const rule = until
        ? `${until.agree} coders agree${until.on ? ` on ${until.on}` : ""}`
        : `${coders} coder${coders > 1 ? "s" : ""} coded it`;
      const max = d.shared.codersPerUnit?.max;
      return `Crowd coding: each unit until ${rule}${max ? `, at most ${max} coders` : ""}${overlap}.`;
    }
    case "groups":
      return `Each condition codes its own units (by ${d.column}).`;
  }
}

/** What will be made, in sentences, what to do next, and what still stops it. */
export function CreateStep({ answers, problems }: { answers: SetupAnswers; problems: string[] }) {
  const lists = questionLists(answers.parts);
  const count = (list: "before" | "unit" | "after") => parseQuestions(answers.questions[list]).length;
  const d = answers.distribution;
  const lines: string[] = [`A study named "${answers.name.trim()}".`];
  if (answers.parts.experiment) {
    lines.push(
      `Coders get a condition (${answers.experiment.name}): ${answers.experiment.conditions.filter(Boolean).join(", ")}, ${answers.experiment.assign === "balanced" ? "balanced" : "at random"}.`,
    );
  }
  if (lists.includes("before") && count("before") > 0) {
    lines.push(
      lists.length > 1 ? `${count("before")} question(s) before the units.` : `${count("before")} question(s).`,
    );
  }
  if (answers.parts.annotate) {
    const shown = [answers.layout.title, answers.layout.byline, ...answers.layout.body].filter(Boolean);
    lines.push(
      answers.units
        ? `${answers.units.units.length} units, showing ${shown.join(", ") || "no fields yet"}.`
        : "No units yet: upload them on the Units tab.",
    );
    lines.push(distributionSummary(d));
    lines.push(`${count("unit")} question(s) about each unit.`);
    if (lists.includes("after") && count("after") > 0) lines.push(`${count("after")} question(s) after the units.`);
  }
  const perSet = answers.parts.annotate && d.mode === "sets";
  lines.push(perSet ? "A link per coder, made when you deploy." : "An open link, made when you deploy.");
  return (
    <>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
        <p className="font-medium">Next, in the design editor</p>
        <p className="mt-1 text-muted-foreground">
          The study opens on its Editor tab. Questions marked <em>to specify</em> need an answer type: select each one
          and choose it. Then save, preview, and deploy; coders can start once it is deployed.
        </p>
      </div>
      {problems.length > 0 && (
        <ul className="space-y-1 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </>
  );
}
