import { Pause, Play } from "lucide-react";
import type { DeploymentResponse, DeploymentStatus } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDeploymentActiveMutation } from "../../../admin/queries";
import { formatWhen } from "../../../admin/format";

/**
 * Controls of the live job (docs/client.md §7, "Overview"): pause it (coders
 * get no new units; units they hold can still be finished) or resume it.
 */
export function LiveControls({ client, deployment }: { client: ResearcherApi; deployment: DeploymentResponse }) {
  const setActive = useDeploymentActiveMutation(client);
  const error = setActive.error;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={setActive.isPending}
          onClick={() => {
            const pausing = deployment.active;
            if (pausing && !confirm("Pause the job? Coders get no new units until you resume it; units they have open can still be finished.")) return;
            setActive.mutate({ codebookId: deployment.codebookId, active: !pausing });
          }}
        >
          {deployment.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {deployment.active ? "Pause" : "Resume"}
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error.message}</span>}
    </div>
  );
}

/** What the server holds in memory for the live job: a line under the progress. */
export function RuntimeLine({ status }: { status: DeploymentStatus }) {
  const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
  return (
    <p className="mt-3 text-[11px] text-muted-foreground">
      Loaded on the server {formatWhen(status.loadedAt)}
      {status.memory &&
        ` · in memory: answers of ${status.memory.coders} coders (${mb(status.memory.coderBytes)})`}
    </p>
  );
}
