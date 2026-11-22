import { useCallback, useState } from "react";
import type { StudyResponse } from "@annotinder/contracts";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useCreateStudyFromRecipeMutation } from "../../admin/queries";
import type { CsvUnits } from "../../admin/csv";
import {
  DEFAULT_SETUP,
  distributionProblems,
  setupProblems,
  setupRecipe,
  type SetupAnswers,
} from "../../admin/setupRecipe";
import { keepFields } from "../../design/simpleLayout";
import { StartStep, ExperimentStep, UnitsStep } from "./setupWizard/StartSteps";
import { DistributionStep } from "./setupWizard/DistributionStep";
import { LayoutStep } from "./setupWizard/LayoutStep";
import { QuestionsStep } from "./setupWizard/QuestionsStep";
import { CreateStep } from "./setupWizard/CreateStep";

// The setup wizard (docs/client.md §7, "Guided setup"): what the study does,
// the experiment's conditions, the units and how they are shown, who codes
// what, and the names of the questions. It makes a recipe
// (admin/setupRecipe.ts); the study then opens in the design editor, where
// the questions get their answer types. Each step is in setupWizard/.

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

/** The wizard's dialog: the steps, Back and Next, and Create study at the end. */
export function SetupWizard({
  client,
  onCreated,
  onClose,
}: {
  client: ResearcherApi;
  onCreated: (study: StudyResponse) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<SetupAnswers>(DEFAULT_SETUP);
  const [step, setStep] = useState<Step>("start");
  const [csv, setCsv] = useState<CsvUnits | null>(null);
  const create = useCreateStudyFromRecipeMutation(client);
  const set = (patch: Partial<SetupAnswers>) => setAnswers((prev) => ({ ...prev, ...patch }));

  // The units come from the CSV form; the layout starts empty (the researcher places the fields) and keeps what still exists.
  const onCsv = useCallback((result: CsvUnits | null) => {
    setCsv(result);
    setAnswers((prev) => {
      const units = result && result.errors.length === 0 ? { fields: result.fields, units: result.units } : null;
      return { ...prev, units, layout: keepFields(prev.layout, units ? units.fields.map((f) => f.name) : []) };
    });
  }, []);

  const steps: Step[] = [
    "start",
    ...(answers.parts.experiment ? (["experiment"] as const) : []),
    ...(answers.parts.annotate ? (["units", "distribution", "layout"] as const) : []),
    "questions",
    "create",
  ];
  const at = steps.indexOf(step);
  const problems = setupProblems(answers);
  const startDone =
    answers.name.trim() !== "" && (answers.parts.annotate || answers.parts.survey || answers.parts.experiment);
  const blocked =
    (step === "units" && csv !== null && csv.errors.length > 0) ||
    (step === "distribution" && distributionProblems(answers).length > 0);

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm fade-in">
      <div
        role="dialog"
        aria-label="Guided setup"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="border-b border-border px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-foreground">Guided setup</h2>
          <ol className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-xs">
            {steps.map((s, i) => (
              <li
                key={s}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5",
                  // Done steps: a leaf tint; the current one: wood
                  i === at
                    ? "bg-wood/15 font-semibold text-foreground"
                    : i < at
                      ? "bg-leaf/15 text-leaf-strong"
                      : "text-muted-foreground",
                )}
              >
                {i > 0 && <span className="text-muted-foreground">/</span>}
                {i < at && <Check className="h-3 w-3" />}
                {STEP_TITLES[s]}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {step === "start" && <StartStep answers={answers} set={set} />}
          {step === "experiment" && <ExperimentStep answers={answers} set={set} />}
          {step === "units" && <UnitsStep answers={answers} set={set} onCsv={onCsv} />}
          {step === "questions" && <QuestionsStep answers={answers} set={set} />}
          {step === "distribution" && <DistributionStep answers={answers} set={set} />}
          {step === "layout" && <LayoutStep answers={answers} set={set} />}
          {step === "create" && <CreateStep answers={answers} problems={problems} />}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {create.isError && (
              <p className="text-xs text-destructive">
                {create.error instanceof ResearcherApiError ? create.error.reason : create.error.message}
              </p>
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
              <Button
                onClick={() => create.mutate(setupRecipe(answers), { onSuccess: onCreated })}
                disabled={problems.length > 0 || create.isPending}
              >
                {create.isPending ? "Creating..." : "Create study"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
