import { useState } from "react";
import { ChevronDown, Sparkles, X } from "lucide-react";
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
    <section className="relative rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
      <button
        type="button"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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
      {/* One line; what it shows and what to try on request */}
      <details className="group pr-8">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-foreground">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Made from the example <span className="font-medium">&ldquo;{example.title}&rdquo;</span>
          </span>
          <span className="text-xs text-primary group-open:hidden">Things to try</span>
          <ChevronDown className="h-3.5 w-3.5 text-primary transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">{example.description}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {example.tryThis.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          It is an ordinary job: change anything. Example answers are from coders named &ldquo;Example coder&rdquo;; delete them on the
          Coders tab before real coding starts.
        </p>
      </details>
    </section>
  );
}
