import { Pause, Play } from "lucide-react";
import type { DeploymentResponse } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDeploymentActiveMutation } from "../../../admin/queries";

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

