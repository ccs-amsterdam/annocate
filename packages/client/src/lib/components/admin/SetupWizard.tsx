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
  parseQuestions,
  questionLists,
  setupProblems,
  setupRecipe,
  type SetupAnswers,
  type SetupParts,
} from "../../admin/setupRecipe";
import { CsvUnitsForm } from "./units/UploadUnits";

// The setup wizard (docs/plans/setup-wizard.md): what the job does, the
// experiment's conditions, the units and who codes what, and the names of
// the questions. It makes a recipe (admin/setupRecipe.ts); the job then
// opens in the codebook editor, where the questions get their answer types.

type Step = "start" | "experiment" | "units" | "questions" | "create";

const STEP_TITLES: Record<Step, string> = {
  start: "What do you want to do?",
  experiment: "The experiment",
  units: "Units",
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

  // The units come from the CSV form; the fields shown default to its text fields.
  const onCsv = useCallback((result: CsvUnits | null) => {
    setCsv(result);
    setA((prev) => {
      const units = result && result.errors.length === 0 ? { fields: result.fields, units: result.units } : null;
      const textFields = units ? units.fields.filter((f) => f.type === "text").map((f) => f.name) : [];
      const distribution = prev.distribution.mode === "byCondition" && !units ? ({ mode: "all" } as const) : prev.distribution;
      return { ...prev, units, shownFields: textFields, distribution };
    });
  }, []);

  const steps: Step[] = ["start", ...(a.parts.experiment ? (["experiment"] as const) : []), ...(a.parts.annotate ? (["units"] as const) : []), "questions", "create"];
  const at = steps.indexOf(step);
  const problems = setupProblems(a);
  const startDone = a.name.trim() !== "" && (a.parts.annotate || a.parts.survey || a.parts.experiment);
  const unitsBlocked = step === "units" && csv !== null && csv.errors.length > 0;

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
              <Button onClick={() => setStep(steps[at + 1])} disabled={!startDone || unitsBlocked}>
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
  const d = a.distribution;
  const fields = a.units?.fields ?? [];
  const conditionField = d.mode === "byCondition" ? d.field : null;
  // The field with the condition is for routing, not for coders to see.
  const byCondition = (field: string) => set({ distribution: { mode: "byCondition", field }, shownFields: a.shownFields.filter((f) => f !== field) });
  return (
    <>
      <Intro>Upload the units coders work on, or skip this and upload them later on the Units tab.</Intro>
      <div className="space-y-3 rounded-lg border border-border p-3">
        <CsvUnitsForm jobFields={NO_FIELDS} onResult={onCsv} />
      </div>

      {fields.length > 0 && (
        <fieldset className="space-y-1 text-sm">
          <legend className="text-xs font-medium text-muted-foreground">Show coders these fields</legend>
          {fields.map((f) => (
            <label key={f.name} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={a.shownFields.includes(f.name)}
                onChange={(ev) =>
                  set({ shownFields: ev.target.checked ? fields.map((x) => x.name).filter((n) => n === f.name || a.shownFields.includes(n)) : a.shownFields.filter((n) => n !== f.name) })
                }
              />
              <span className="font-mono text-xs">{f.name}</span>
              {f.name === conditionField && <span className="text-xs text-muted-foreground">(the condition)</span>}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="space-y-1.5 text-sm">
        <legend className="text-xs font-medium text-muted-foreground">Who codes what</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={d.mode === "all"} onChange={() => set({ distribution: { mode: "all" } })} />
          Every coder codes every unit
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" checked={d.mode === "split"} onChange={() => set({ distribution: { mode: "split", coders: 1 } })} />
          Share the units out: each unit coded by
          <select
            aria-label="Coders per unit"
            className="h-7 rounded-md border border-input bg-background px-1 text-xs"
            value={d.mode === "split" ? d.coders : 1}
            onChange={(ev) => set({ distribution: { mode: "split", coders: Number(ev.target.value) } })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          coder{d.mode === "split" && d.coders > 1 ? "s" : ""}
        </label>
        {a.parts.experiment && (
          <label className={cn("flex flex-wrap items-center gap-2", !a.units && "text-muted-foreground")}>
            <input
              type="radio"
              disabled={!a.units}
              checked={d.mode === "byCondition"}
              onChange={() => byCondition(fields.at(-1)?.name ?? "")}
            />
            A set of units per condition, by the field
            <select
              aria-label="Field with the condition"
              disabled={!a.units}
              className="h-7 rounded-md border border-input bg-background px-1 text-xs"
              value={conditionField ?? ""}
              onChange={(ev) => byCondition(ev.target.value)}
            >
              {fields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
            <span className="w-full pl-6 text-xs text-muted-foreground">
              Each participant codes the units whose {conditionField ?? "field"} is their condition ({a.experiment.conditions.filter(Boolean).join(", ")}).
              {!a.units && " Needs the units now."}
            </span>
          </label>
        )}
        {d.mode === "split" && (
          <p className="pl-6 text-xs text-muted-foreground">
            More than one coder per unit lets you check how well coders agree. The editor has more options (agreement, units per coder).
          </p>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={a.order === "random"} onChange={(ev) => set({ order: ev.target.checked ? "random" : "sequential" })} />
        Random order per coder (otherwise as uploaded)
      </label>
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
    lines.push(a.units ? `${a.units.units.length} units, showing ${a.shownFields.join(", ") || "no fields yet"}.` : "No units yet: upload them on the Units tab.");
    lines.push(
      d.mode === "all"
        ? "Every coder codes every unit."
        : d.mode === "split"
          ? `The units are shared out, each coded by ${d.coders} coder${d.coders > 1 ? "s" : ""}.`
          : `Each participant codes the units of their condition (field ${d.field}).`,
    );
    lines.push(`${count("unit")} question(s) about each unit.`);
    if (lists.includes("after") && count("after") > 0) lines.push(`${count("after")} question(s) after the units.`);
  }
  lines.push("An open invitation link.");
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
