import type { UnitField } from "@annotinder/contracts";
import { Check, FlaskConical, ListChecks, MessageSquareText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import type { CsvUnits } from "../../../admin/csv";
import type { SetupParts } from "../../../admin/setupRecipe";
import { HelpButton } from "../../../help/HelpButton";
import { CsvUnitsForm } from "../units/UploadUnits";
import { Intro, type StepProps } from "./common";

// The first steps of the setup wizard: what the study does, the experiment, the units.

const NO_FIELDS: UnitField[] = [];

const PARTS: { key: keyof SetupParts; title: string; text: string; icon: typeof ListChecks }[] = [
  {
    key: "annotate",
    title: "Annotate units",
    text: "Coders get texts (or other units) one by one and answer questions about each.",
    icon: ListChecks,
  },
  {
    key: "survey",
    title: "Ask questions",
    text: "Coders answer questions once: about themselves, or their opinion (a survey).",
    icon: MessageSquareText,
  },
  {
    key: "experiment",
    title: "Experiment",
    text: "Coders are assigned to conditions (e.g. control and treatment), to show them different texts or units.",
    icon: FlaskConical,
  },
];

/** The study's name, its title for coders, and what it does. */
export function StartStep({ answers, set }: StepProps) {
  return (
    <>
      <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
        The guided setup makes a study quickly: what it does, the units, who codes what, how a unit looks, and the names
        of your questions. It then opens in the editor, where you specify the questions and can add what the setup
        leaves out (conditions, agreement, personal or panel links, and more).{" "}
        <HelpButton topic="setup-wizard">What only the editor does</HelpButton>
      </p>
      <label className="block text-xs font-medium text-muted-foreground">
        Study name
        <Input
          className="mt-1"
          autoFocus
          value={answers.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. News pilot"
        />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          Title coders see (optional)
          <InfoTip label="About the title coders see">
            The study name stays private; coders see this title instead, or &quot;Untitled study&quot;.
          </InfoTip>
        </span>
        <Input
          className="mt-1"
          value={answers.publicTitle}
          onChange={(e) => set({ publicTitle: e.target.value })}
          placeholder={answers.name.trim() || "e.g. Reading the news"}
        />
      </label>
      <Intro>Choose one or more. You can change everything later in the editor.</Intro>
      <div className="grid gap-2 sm:grid-cols-3">
        {PARTS.map(({ key, title, text, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={answers.parts[key]}
            onClick={() => set({ parts: { ...answers.parts, [key]: !answers.parts[key] } })}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
              answers.parts[key] ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon className="h-4 w-4" /> {title}
              {answers.parts[key] && <Check className="ml-auto h-4 w-4 text-primary" />}
            </span>
            <span className="text-xs text-muted-foreground">{text}</span>
          </button>
        ))}
      </div>
      {answers.parts.experiment && !answers.parts.annotate && !answers.parts.survey && (
        <p className="text-xs text-muted-foreground">
          An experiment alone asks questions too: it is set up as questions with an experiment.
        </p>
      )}
    </>
  );
}

/** The experiment: the condition's name, its values, and how coders get one. */
export function ExperimentStep({ answers, set }: StepProps) {
  const e = answers.experiment;
  return (
    <>
      <Intro>
        Each coder is assigned one condition when they start. It is stored with their answers, and the editor can use it
        to show different texts, questions or units per condition.
      </Intro>
      <label className="block text-xs font-medium text-muted-foreground">
        Name of the condition variable
        <Input
          className="mt-1 font-mono"
          value={e.name}
          onChange={(ev) => set({ experiment: { ...e, name: ev.target.value } })}
        />
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
          <input
            type="radio"
            checked={e.assign === "balanced"}
            onChange={() => set({ experiment: { ...e, assign: "balanced" } })}
          />
          Balanced: the condition with the fewest coders so far
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={e.assign === "random"}
            onChange={() => set({ experiment: { ...e, assign: "random" } })}
          />
          Random: a random draw per coder
        </label>
      </fieldset>
    </>
  );
}

/** The units (a CSV, or later) and their order. */
export function UnitsStep({ answers, set, onCsv }: StepProps & { onCsv: (result: CsvUnits | null) => void }) {
  return (
    <>
      <Intro>Upload the units coders work on, or skip this and upload them later on the Units tab.</Intro>
      <div className="space-y-3 rounded-lg border border-border p-3">
        <CsvUnitsForm studyFields={NO_FIELDS} onResult={onCsv} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={answers.order === "random"}
          onChange={(ev) => set({ order: ev.target.checked ? "random" : "sequential" })}
        />
        Random order per coder (otherwise as uploaded)
      </label>
    </>
  );
}
