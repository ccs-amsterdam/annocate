import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useResultsAgreementQuery, useResultsAnswersQuery } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { AgreementView } from "./AgreementView";
import { DownloadView } from "./DownloadView";
import { QuestionsView } from "./QuestionsView";
import { useDesignLabels } from "./designLabels";

const VIEWS = ["Download", "Questions", "Agreement"] as const;
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

function Summary({ client, view }: { client: ResearcherApi; view: "Questions" | "Agreement" }) {
  const labels = useDesignLabels(client);
  const answers = useResultsAnswersQuery(client);
  const agreement = useResultsAgreementQuery(client);
  const query = view === "Questions" ? answers : agreement;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {query.dataUpdatedAt > 0 && `As of ${new Date(query.dataUpdatedAt).toLocaleTimeString()}.`}
        </p>
        <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", query.isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>
      {query.error ? (
        <p className="text-sm text-destructive">{query.error.message}</p>
      ) : view === "Questions" ? (
        answers.data ? (
          <QuestionsView questions={answers.data.questions} labels={labels} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )
      ) : agreement.data ? (
        <AgreementView questions={agreement.data.questions} labels={labels} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
