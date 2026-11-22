import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import {
  useResultCodersQuery,
  useResultUnitsQuery,
  useResultsAgreementQuery,
  useResultsAnswersQuery,
} from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { AgreementView } from "./AgreementView";
import { DownloadView } from "./DownloadView";
import { QuestionsView } from "./QuestionsView";
import { UnitsView } from "./UnitsView";
import { CodersView } from "./CodersView";
import { useQueryClient } from "@tanstack/react-query";
import { useDesignLabels } from "./designLabels";

const VIEWS = ["Download", "Questions", "Agreement", "Units", "Coders"] as const;
type View = (typeof VIEWS)[number];

/**
 * The Results tab (docs/client.md §7, "Results"): downloading the data, and
 * looking at it so far: answers per question and agreement. Those load
 * once, and again on Refresh.
 */
export function ResultsPanel({ client }: { client: ResearcherApi }) {
  const [view, setView] = useState<View>("Download");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div role="tablist" aria-label="Results" className="flex gap-1 border-b border-border">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
              view === v
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "Download" ? <DownloadView client={client} /> : <Summary client={client} view={view} />}
    </div>
  );
}

type SummaryView = Exclude<View, "Download">;

function Summary({ client, view }: { client: ResearcherApi; view: SummaryView }) {
  const labels = useDesignLabels(client);
  const queryClient = useQueryClient();
  const answers = useResultsAnswersQuery(client);
  const agreement = useResultsAgreementQuery(client);
  const units = useResultUnitsQuery(client);
  const coders = useResultCodersQuery(client);
  // The Coders view also shows agreement; the others need one query each
  const queries = { Questions: [answers], Agreement: [agreement], Units: [units], Coders: [coders, agreement] }[view];
  const loading = queries.some((q) => !q.data);
  const error = queries.find((q) => q.error)?.error;
  const fetching = queries.some((q) => q.isFetching);
  const updated = Math.min(...queries.map((q) => q.dataUpdatedAt));
  // Refresh: everything under the results key (the open unit too)
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin", "study", client.studyId ?? "current", "results"] });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {updated > 0 && `As of ${new Date(updated).toLocaleTimeString()}.`}
        </p>
        <Button variant="outline" size="sm" disabled={fetching} onClick={refresh}>
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", fetching && "animate-spin")} /> Refresh
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : view === "Questions" ? (
        <QuestionsView questions={answers.data!.questions} labels={labels} />
      ) : view === "Agreement" ? (
        <AgreementView questions={agreement.data!.questions} labels={labels} />
      ) : view === "Units" ? (
        <UnitsView client={client} units={units.data!.units} labels={labels} />
      ) : (
        <CodersView coders={coders.data!.coders} agreement={agreement.data!.questions} />
      )}
    </div>
  );
}
