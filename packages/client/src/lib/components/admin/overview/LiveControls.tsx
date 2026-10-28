import { Pause, Play, RefreshCw } from "lucide-react";
import type { DeploymentResponse, DeploymentStatus } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDeploymentActiveMutation, useRefreshDeploymentMutation } from "../../../admin/queries";
import { formatWhen } from "../../../admin/format";

/**
 * Controls of the live job (docs/client.md §7, "Overview"): pause it (coders
 * get no new units; units they hold can still be finished) or resume it,
 * and reload it on the server (normally automatic: after publishing, units
 * and unitsets changing, resets).
 */
export function LiveControls({ client, deployment }: { client: ResearcherApi; deployment: DeploymentResponse }) {
  const setActive = useDeploymentActiveMutation(client);
  const refresh = useRefreshDeploymentMutation(client);
  const error = setActive.error ?? refresh.error;
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
        <Button
          variant="ghost"
          size="sm"
          disabled={refresh.isPending}
          title="Has the server read the job again now, including unit content. Normally not needed: it does so by itself after changes."
          onClick={() => refresh.mutate({ units: "all" })}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
          Reload
        </Button>
      </div>
      {refresh.isSuccess && <span className="text-xs text-muted-foreground">Reloaded.</span>}
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
        ` · in memory: ${status.memory.units} units (${mb(status.memory.unitBytes)}), ${status.memory.coders} coders (${mb(status.memory.coderBytes)})`}
    </p>
  );
}
