import type { ReactNode } from "react";
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
import { useDesignLabels, type DesignLabels } from "./designLabels";
import { RESULTS_VIEWS, useResultsView, type ResultsView } from "./resultsView";

/**
 * The Results page (docs/client.md §7, "Results"): the answers so far (per
 * question, agreement, units by disagreement), the coders (their time and
 * agreement; the coders themselves are on the Coders page), and the download. Summaries load once, and again on
 * Refresh.
 */
export function ResultsPanel({ client }: { client: ResearcherApi }) {
  const [view, setView] = useResultsView();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div role="tablist" aria-label="Results" className="flex gap-1 border-b border-border">
        {RESULTS_VIEWS.map((v) => (
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

type SummaryView = Exclude<ResultsView, "Download">;

/** The summaries the server keeps, each loaded once. */
function useSummaries(client: ResearcherApi) {
  return {
    answers: useResultsAnswersQuery(client),
    agreement: useResultsAgreementQuery(client),
    units: useResultUnitsQuery(client),
    coders: useResultCodersQuery(client),
  };
}
type Summaries = ReturnType<typeof useSummaries>;
type SummaryName = keyof Summaries;

/** Per view: the summaries it needs, and what it shows once they are loaded. */
const VIEWS: Record<
  SummaryView,
  { needs: SummaryName[]; show: (data: Summaries, client: ResearcherApi, labels: DesignLabels) => ReactNode }
> = {
  Questions: {
    needs: ["answers"],
    show: ({ answers }, _client, labels) => <QuestionsView questions={answers.data!.questions} labels={labels} />,
  },
  Agreement: {
    needs: ["agreement"],
    show: ({ agreement }, _client, labels) => <AgreementView questions={agreement.data!.questions} labels={labels} />,
  },
  Units: {
    needs: ["units"],
    show: ({ units }, client, labels) => <UnitsView client={client} units={units.data!.units} labels={labels} />,
  },
  // Per coder session: time and agreement
  Coders: {
    needs: ["coders", "agreement"],
    show: ({ coders, agreement }) => <CodersView coders={coders.data!.coders} agreement={agreement.data!.questions} />,
  },
};

function Summary({ client, view }: { client: ResearcherApi; view: SummaryView }) {
  const labels = useDesignLabels(client);
  const queryClient = useQueryClient();
  const summaries = useSummaries(client);
  const queries = VIEWS[view].needs.map((name) => summaries[name]);
  const error = queries.find((q) => q.error)?.error;
  const fetching = queries.some((q) => q.isFetching);
  const updated = Math.min(...queries.map((q) => q.dataUpdatedAt));
  // Refresh: everything under the results key (the open unit too)
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin", "study", client.studyId ?? "current", "results"] });
  const content = () => {
    if (error) return <p className="text-sm text-destructive">{error.message}</p>;
    if (queries.some((q) => !q.data)) return <p className="text-sm text-muted-foreground">Loading…</p>;
    return VIEWS[view].show(summaries, client, labels);
  };
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
      {content()}
    </div>
  );
}
