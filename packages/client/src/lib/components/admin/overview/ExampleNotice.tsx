import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useExamplesQuery, useJobQuery } from "../../../admin/queries";

const dismissedKey = (jobId: number) => `annotinder.exampleNotice.${jobId}`;

function isDismissed(jobId: number): boolean {
  try {
    return localStorage.getItem(dismissedKey(jobId)) === "1";
  } catch {
    return false;
  }
}

/**
 * On a job made from an example (docs/plans/examples.md): which example,
 * and what to try, until the researcher closes it (remembered in this
 * browser).
 */
export function ExampleNotice({ client }: { client: ResearcherApi }) {
  const job = useJobQuery(client).data ?? null;
  const origin = job?.origin ?? null;
  const examples = useExamplesQuery(client, origin !== null).data ?? [];
  const [dismissed, setDismissed] = useState(() => (job ? isDismissed(job.id) : false));
  const example = examples.find((e) => e.id === origin);
  if (!job || !example || dismissed || isDismissed(job.id)) return null;

  return (
    <section className="relative rounded-xl border border-primary/30 bg-primary/5 p-5">
      <button
        type="button"
        className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Close"
        onClick={() => {
          try {
            localStorage.setItem(dismissedKey(job.id), "1");
          } catch {
            // Not remembered: it comes back next time
          }
          setDismissed(true);
        }}
      >
        <X className="h-4 w-4" />
      </button>
      <h2 className="flex items-center gap-2 font-medium text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        Made from the example &ldquo;{example.title}&rdquo;
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{example.description}</p>
      <p className="mt-3 text-sm font-medium text-foreground">Things to try</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {example.tryThis.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        It is an ordinary job: change anything. Example answers are from coders named &ldquo;Example coder&rdquo;; delete them on the
        Coders tab before real coding starts.
      </p>
    </section>
  );
}
