import { useCallback, useState, type ReactNode } from "react";
import type { JobResponse, UnitField } from "@annotinder/contracts";
import { Check, FlaskConical, ListChecks, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useCreateJobFromRecipeMutation } from "../../admin/queries";
import type { CsvUnits } from "../../admin/csv";
import {
  DEFAULT_SETUP,
  DISTRIBUTIONS,
  columnValues,
  defaultDistribution,
  distributionProblems,
  distributionSets,
  overlapCount,
  parseQuestions,
  questionLists,
  setupProblems,
  setupRecipe,
  type SetupAnswers,
  type SetupDistribution,
  type SetupOverlap,
  type SetupParts,
} from "../../admin/setupRecipe";
import { guessSimpleLayout } from "../../codebook/simpleLayout";
import { CsvUnitsForm } from "./units/UploadUnits";
import { HelpButton } from "../../help/HelpButton";
import { LayoutDesigner, UnitPreview } from "./LayoutDesigner";
import { SharedSettings } from "./UnitLoopForm";

// The setup wizard (docs/plans/setup-wizard.md): what the job does, the
// experiment's conditions, the units and how they are shown, the names of
// the questions, and who codes what. It makes a recipe (admin/setupRecipe.ts); the job then
// opens in the codebook editor, where the questions get their answer types.

type Step = "start" | "experiment" | "units" | "distribution" | "layout" | "questions" | "create";

const STEP_TITLES: Record<Step, string> = {
  start: "What do you want to do?",
  experiment: "The experiment",
  units: "Units",
  distribution: "Who codes what",
  layout: "How coders see a unit",
  questions: "Questions",
  create: "Check and create",
};

const NO_FIELDS: UnitField[] = [];

export function SetupWizard({ client, onCreated, onClose }: { client: ResearcherApi; onCreated: (job: JobResponse) => void; onClose: () => void }) {
  const [a, setA] = useState<SetupAnswers>(DEFAULT_SETUP);
  const [step, setStep] = useState<Step>("start");
  const [csv, setCsv] = useState<CsvUnits | null>(null);
  const create = useCreateJobFromRecipeMutation(client);
  const set = (patch: Partial<SetupAnswers>) => setA((prev) => ({ ...prev, ...patch }));

  // The units come from the CSV form; the layout starts from a guess by the text fields' names.
  const onCsv = useCallback((result: CsvUnits | null) => {
    setCsv(result);
    setA((prev) => {
      const units = result && result.errors.length === 0 ? { fields: result.fields, units: result.units } : null;
      const textFields = units ? units.fields.filter((f) => f.type === "text").map((f) => f.name) : [];
      return { ...prev, units, layout: guessSimpleLayout(textFields) };
    });
  }, []);

  const steps: Step[] = [
    "start",
    ...(a.parts.experiment ? (["experiment"] as const) : []),
    ...(a.parts.annotate ? (["units", "distribution", "layout"] as const) : []),
    "questions",
    "create",
  ];
  const at = steps.indexOf(step);
  const problems = setupProblems(a);
  const startDone = a.name.trim() !== "" && (a.parts.annotate || a.parts.survey || a.parts.experiment);
  const blocked = (step === "units" && csv !== null && csv.errors.length > 0) || (step === "distribution" && distributionProblems(a).length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
      <div role="dialog" aria-label="Guided setup" className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-foreground">Guided setup</h2>
          <ol className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-xs">
            {steps.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-1", i === at ? "font-semibold text-primary" : i < at ? "text-foreground" : "text-muted-foreground")}>
                {i > 0 && <span className="text-muted-foreground">/</span>}
                {i < at && <Check className="h-3 w-3" />}
                {STEP_TITLES[s]}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {step === "start" && <StartStep a={a} set={set} />}
          {step === "experiment" && <ExperimentStep a={a} set={set} />}
          {step === "units" && <UnitsStep a={a} set={set} onCsv={onCsv} />}
          {step === "questions" && <QuestionsStep a={a} set={set} />}
          {step === "distribution" && <DistributionStep a={a} set={set} />}
          {step === "layout" && <LayoutStep a={a} set={set} />}
          {step === "create" && <CreateStep a={a} problems={problems} />}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {create.isError && (
              <p className="text-xs text-destructive">{create.error instanceof ResearcherApiError ? create.error.reason : create.error.message}</p>
            )}
            {at > 0 && (
              <Button variant="outline" onClick={() => setStep(steps[at - 1])} disabled={create.isPending}>
                Back
              </Button>
            )}
            {step !== "create" ? (
              <Button onClick={() => setStep(steps[at + 1])} disabled={!startDone || blocked}>
                Next
              </Button>
            ) : (
              <Button onClick={() => create.mutate(setupRecipe(a), { onSuccess: onCreated })} disabled={problems.length > 0 || create.isPending}>
                {create.isPending ? "Creating..." : "Create job"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  a: SetupAnswers;
  set: (patch: Partial<SetupAnswers>) => void;
}

function Intro({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

const PARTS: { key: keyof SetupParts; title: string; text: string; icon: typeof ListChecks }[] = [
  { key: "annotate", title: "Annotate units", text: "Coders get texts (or other units) one by one and answer questions about each.", icon: ListChecks },
  { key: "survey", title: "Ask questions", text: "Participants answer questions once: about themselves, or their opinion (a survey).", icon: MessageSquareText },
  {
    key: "experiment",
    title: "Experiment",
    text: "Participants are assigned to conditions (e.g. control and treatment), to show them different texts or units.",
    icon: FlaskConical,
  },
];

function StartStep({ a, set }: StepProps) {
  return (
    <>
      <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
        The guided setup makes a job quickly: what it does, the units, who codes what, how a unit looks, and the names of your
        questions. It then opens in the editor, where you specify the questions and can add what the setup leaves out
        (conditions, agreement, personal or panel links, and more).{" "}
        <HelpButton topic="setup-wizard">What only the editor does</HelpButton>
      </p>
      <label className="block text-xs font-medium text-muted-foreground">
        Job name
        <Input className="mt-1" autoFocus value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. News pilot" />
      </label>
      <Intro>Choose one or more. You can change everything later in the editor.</Intro>
      <div className="grid gap-2 sm:grid-cols-3">
        {PARTS.map(({ key, title, text, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={a.parts[key]}
            onClick={() => set({ parts: { ...a.parts, [key]: !a.parts[key] } })}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
              a.parts[key] ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon className="h-4 w-4" /> {title}
              {a.parts[key] && <Check className="ml-auto h-4 w-4 text-primary" />}
            </span>
            <span className="text-xs text-muted-foreground">{text}</span>
          </button>
        ))}
      </div>
      {a.parts.experiment && !a.parts.annotate && !a.parts.survey && (
        <p className="text-xs text-muted-foreground">An experiment alone asks questions too: it is set up as questions with an experiment.</p>
      )}
    </>
  );
}

function ExperimentStep({ a, set }: StepProps) {
  const e = a.experiment;
  return (
    <>
      <Intro>
        Each participant is assigned one condition when they start. It is stored with their answers, and the editor can
        use it to show different texts, questions or units per condition.
      </Intro>
      <label className="block text-xs font-medium text-muted-foreground">
        Name of the condition variable
        <Input className="mt-1 font-mono" value={e.name} onChange={(ev) => set({ experiment: { ...e, name: ev.target.value } })} />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Conditions (one per line)
        <Textarea
          className="mt-1 font-mono"
          rows={3}
          value={e.conditions.join("\n")}
          onChange={(ev) => set({ experiment: { ...e, conditions: ev.target.value.split("\n").map((c) => c.trim()) } })}
        />
      </label>
      <fieldset className="space-y-1 text-sm">
        <legend className="text-xs font-medium text-muted-foreground">Assignment</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={e.assign === "balanced"} onChange={() => set({ experiment: { ...e, assign: "balanced" } })} />
          Balanced: the condition with the fewest participants so far
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={e.assign === "random"} onChange={() => set({ experiment: { ...e, assign: "random" } })} />
          Random: a random draw per participant
        </label>
      </fieldset>
    </>
  );
}

function UnitsStep({ a, set, onCsv }: StepProps & { onCsv: (result: CsvUnits | null) => void }) {
  return (
    <>
      <Intro>Upload the units coders work on, or skip this and upload them later on the Units tab.</Intro>
      <div className="space-y-3 rounded-lg border border-border p-3">
        <CsvUnitsForm jobFields={NO_FIELDS} onResult={onCsv} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={a.order === "random"} onChange={(ev) => set({ order: ev.target.checked ? "random" : "sequential" })} />
        Random order per coder (otherwise as uploaded)
      </label>
    </>
  );
}

const numberInput = "h-7 w-16 rounded-md border border-input bg-background px-1.5 text-xs";
const smallSelect = "h-7 rounded-md border border-input bg-background px-1 text-xs";

function DistributionStep({ a, set }: StepProps) {
  const d = a.distribution;
  const columns = (a.units?.fields ?? []).map((f) => f.name);
  const choose = (mode: SetupDistribution["mode"]) => set({ distribution: defaultDistribution(mode, columns) });
  const update = (patch: Partial<SetupDistribution>) => set({ distribution: { ...d, ...patch } as SetupDistribution });
  const options = DISTRIBUTIONS.filter((o) => o.mode !== "groups" || a.parts.experiment);
  const problems = distributionProblems(a);
  const { sets, overlap } = distributionSets(d, a.units);
  return (
    <>
      <label className="block text-xs font-medium text-muted-foreground">
        Who codes which units
        <select className="mt-1 block h-9 w-full max-w-sm rounded-md border border-input bg-background px-2 text-sm" value={d.mode} onChange={(e) => choose(e.target.value as SetupDistribution["mode"])}>
          {options.map((o) => (
            <option key={o.mode} value={o.mode}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">{DISTRIBUTIONS.find((o) => o.mode === d.mode)!.help}</p>

      <div className="space-y-3 text-sm">
        {d.mode === "sets" && (
          <>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-muted-foreground">The sets</legend>
              <label className="flex flex-wrap items-center gap-2">
                <input type="radio" checked={d.source === "split"} onChange={() => update({ source: "split" })} />
                Divide the units into
                <input aria-label="Number of sets" type="number" min={1} className={numberInput} value={d.sets} onChange={(e) => update({ sets: Number(e.target.value) })} />
                sets
              </label>
              <label className={cn("flex flex-wrap items-center gap-2", columns.length === 0 && "text-muted-foreground")}>
                <input type="radio" disabled={columns.length === 0} checked={d.source === "column"} onChange={() => update({ source: "column" })} />
                One set per value of the column
                <select aria-label="Column with the set" disabled={columns.length === 0} className={smallSelect} value={d.column} onChange={(e) => update({ source: "column", column: e.target.value })}>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <OverlapInput overlap={d.overlap} units={a.units?.units.length ?? 0} onChange={(overlap) => update({ overlap })} />
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-muted-foreground">How coders get a set</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={d.handOut === "rotate"} onChange={() => update({ handOut: "rotate" })} />
                One link: each new coder gets the set with the fewest coders
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={d.handOut === "links"} onChange={() => update({ handOut: "links" })} />
                An invitation link per set: you decide who gets which (e.g. a few expert coders)
              </label>
            </fieldset>
            {a.units && sets.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {sets.map((s) => `${s.name}: ${s.units.length}`).join(", ")}
                {overlap.length > 0 && `; overlap: ${overlap.length} units every coder codes`}
              </p>
            )}
          </>
        )}

        {d.mode === "crowd" && (
          <>
            <SharedSettings branch={d.shared} agreeable={[]} allowAgreement={false} onChange={(shared) => update({ shared: shared as typeof d.shared })} />
            <p className="text-xs text-muted-foreground">
              Coding until coders agree on a question is set in the editor, once the question has its answer type.{" "}
              <HelpButton topic="setup-wizard">What only the editor does</HelpButton>
            </p>
            <OverlapInput overlap={d.overlap} units={a.units?.units.length ?? 0} onChange={(overlap) => update({ overlap })} />
          </>
        )}

        {d.mode === "groups" && (
          <>
            <label className="flex flex-wrap items-center gap-2">
              The units of each condition, by the column
              <select aria-label="Column for the groups" className={smallSelect} value={d.column} onChange={(e) => update({ column: e.target.value, values: {} })}>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              {a.experiment.conditions
                .filter((c) => c.trim())
                .map((condition) => (
                  <fieldset key={condition} className="rounded-md border border-border p-2">
                    <legend className="px-1 text-xs font-medium">{condition}</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {columnValues(a.units, d.column).map((value) => {
                        const chosen = d.values[condition] ?? [];
                        return (
                          <label key={value} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={chosen.includes(value)}
                              onChange={(e) =>
                                update({ values: { ...d.values, [condition]: e.target.checked ? [...chosen, value] : chosen.filter((v) => v !== value) } })
                              }
                            />
                            {value || "(empty)"}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
            </div>
          </>
        )}

        {d.mode === "later" && (
          <p className="text-xs text-muted-foreground">
            The unit loop is made without a choice: it is marked <em>to specify</em> in the editor, where its Units tab has every
            option (also coder groups by any question, and more).
          </p>
        )}
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

/** Overlap units: none, a number, or a percentage of the units. */
function OverlapInput({ overlap, units, onChange }: { overlap: SetupOverlap; units: number; onChange: (overlap: SetupOverlap) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={overlap !== null} onChange={(e) => onChange(e.target.checked ? { by: "percent", value: 10 } : null)} />
        Overlap: units every coder codes (to compare coders)
      </label>
      {overlap && (
        <>
          <input aria-label="Overlap size" type="number" min={1} className={numberInput} value={overlap.value} onChange={(e) => onChange({ ...overlap, value: Number(e.target.value) })} />
          <select aria-label="Overlap in" className={smallSelect} value={overlap.by} onChange={(e) => onChange({ ...overlap, by: e.target.value as "units" | "percent" })}>
            <option value="percent">% of the units</option>
            <option value="units">units</option>
          </select>
          {units > 0 && <span className="text-xs text-muted-foreground">({overlapCount(overlap, units)} units)</span>}
        </>
      )}
    </div>
  );
}

function LayoutStep({ a, set }: StepProps) {
  const fields = (a.units?.fields ?? []).map((f) => f.name);
  const first = a.units?.units[0];
  return (
    <>
      <Intro>
        Click a place in the sketch to put a field there: a title, a byline, and the body. The editor&apos;s Layout tab can change
        this later, or (Advanced) write the layout as a template.
      </Intro>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layout</h3>
          {fields.length > 0 ? (
            <LayoutDesigner layout={a.layout} fields={fields} onChange={(layout) => set({ layout })} />
          ) : (
            <p className="text-sm text-muted-foreground">Upload units first (or choose their fields in the editor later).</p>
          )}
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The first unit, as coders see it</h3>
          <div className="rounded-lg border border-border bg-background p-4">
            {first ? <UnitPreview layout={a.layout} unit={{ id: first.externalId, ...first.data }} /> : <p className="text-sm text-muted-foreground">No units yet.</p>}
          </div>
        </section>
      </div>
    </>
  );
}

const LIST_TEXT: Record<"before" | "unit" | "after", { title: string; text: string }> = {
  before: { title: "Questions before the units", text: "Asked once, e.g. consent, age or prior opinions." },
  unit: { title: "Questions about each unit", text: "Asked for every unit a coder gets." },
  after: { title: "Questions after the units", text: "Asked once at the end, e.g. comments." },
};

function QuestionsStep({ a, set }: StepProps) {
  const lists = questionLists(a.parts);
  return (
    <>
      <Intro>
        Name the questions you want to ask, one per line: a short name (<code>age</code>) or the question itself (
        <code>How old are you?</code>). You choose each question's answer type (options, a scale, a number, selecting
        text...) in the editor next, where you can also make questions conditional.
      </Intro>
      {lists.map((list) => {
        const names = parseQuestions(a.questions[list]).map((q) => q.name);
        const heading = lists.length === 1 ? { title: list === "unit" ? LIST_TEXT.unit.title : "Questions", text: list === "unit" ? LIST_TEXT.unit.text : "Asked once per participant." } : LIST_TEXT[list];
        return (
          <label key={list} className="block">
            <span className="text-sm font-medium text-foreground">{heading.title}</span>
            <span className="block text-xs text-muted-foreground">{heading.text}</span>
            <Textarea
              className="mt-1"
              rows={4}
              aria-label={heading.title}
              value={a.questions[list].join("\n")}
              onChange={(ev) => set({ questions: { ...a.questions, [list]: ev.target.value.split("\n") } })}
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
    </>
  );
}

/** Who codes what, in a sentence. */
function distributionSummary(d: SetupDistribution): string {
  const overlap = "overlap" in d && d.overlap ? `, plus overlap units every coder codes` : "";
  switch (d.mode) {
    case "all":
      return "Every coder codes every unit.";
    case "sets":
      return `${d.source === "split" ? `The units in ${d.sets} sets` : `A set per value of ${d.column}`}, one per coder${overlap}; ${d.handOut === "links" ? "a link per set" : "each new coder gets the set with the fewest coders"}.`;
    case "crowd": {
      const until = d.shared.until;
      const rule = "agree" in until ? `${until.agree} coders agree${until.on ? ` on ${until.on}` : ""}` : `${until.coders} coder${until.coders > 1 ? "s" : ""} coded it`;
      return `Crowd coding: each unit until ${rule}${d.shared.maxCoders ? `, at most ${d.shared.maxCoders} coders` : ""}${overlap}.`;
    }
    case "groups":
      return `Each condition codes its own units (by ${d.column}).`;
    case "later":
      return "Who codes which units: to set in the editor.";
  }
}

function CreateStep({ a, problems }: { a: SetupAnswers; problems: string[] }) {
  const lists = questionLists(a.parts);
  const count = (list: "before" | "unit" | "after") => parseQuestions(a.questions[list]).length;
  const d = a.distribution;
  const lines: string[] = [`A job named "${a.name.trim()}".`];
  if (a.parts.experiment) {
    lines.push(`Participants get a condition (${a.experiment.name}): ${a.experiment.conditions.filter(Boolean).join(", ")}, ${a.experiment.assign === "balanced" ? "balanced" : "at random"}.`);
  }
  if (lists.includes("before") && count("before") > 0) {
    lines.push(lists.length > 1 ? `${count("before")} question(s) before the units.` : `${count("before")} question(s).`);
  }
  if (a.parts.annotate) {
    const shown = [a.layout.title, a.layout.byline, ...a.layout.body].filter(Boolean);
    lines.push(a.units ? `${a.units.units.length} units, showing ${shown.join(", ") || "no fields yet"}.` : "No units yet: upload them on the Units tab.");
    lines.push(distributionSummary(d));
    lines.push(`${count("unit")} question(s) about each unit.`);
    if (lists.includes("after") && count("after") > 0) lines.push(`${count("after")} question(s) after the units.`);
  }
  const perSet = a.parts.annotate && d.mode === "sets" && d.handOut === "links";
  lines.push(perSet ? "An invitation link per set." : "An open invitation link.");
  return (
    <>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
        <p className="font-medium">Next, in the codebook editor</p>
        <p className="mt-1 text-muted-foreground">
          The job opens on its Codebook tab. Questions marked <em>to specify</em> need an answer type: select each one and choose
          it. Then save, preview, and publish; coders can start once it is published.
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
