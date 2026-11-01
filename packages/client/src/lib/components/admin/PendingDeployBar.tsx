import { useState } from "react";
import { codebookErrors, designItems, type TopLevelItem } from "@annotinder/contracts";
import { Rocket } from "lucide-react";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useCodebookQuery, useCodebooksQuery, useDeploymentQuery, usePendingChangesQuery, usePublishMutation } from "../../admin/queries";
import { describeVersions } from "../../codebook/versions";
import { Button } from "@/components/ui/button";
import { DeployDialog, describeUnitChanges } from "./DeployDialog";

/**
 * Everything is a draft until deployed (docs/plans/design.md §5): when a
 * deployed job's drafts differ from what coders get, says what differs and
 * opens the deploy dialog. Draft units and sets are ticked there; a
 * design draft is offered, not ticked (it's deployed from the editor
 * as a rule).
 */
export function PendingDeployBar({ client, includeCodebook = false }: { client: ResearcherApi; includeCodebook?: boolean }) {
  const deployment = useDeploymentQuery(client).data;
  const pending = usePendingChangesQuery(client, !!deployment).data;
  const codebooks = useCodebooksQuery(client).data ?? [];
  const versions = describeVersions(codebooks, deployment?.codebookId ?? null);
  // Only a draft (not frozen) codebook is offered: an older version is restored from the editor first.
  const draftId = pending?.codebookId !== null && pending?.codebookId === versions.draftId ? versions.draftId : null;
  const draft = useCodebookQuery(client, draftId).data ?? null;
  const live = useCodebookQuery(client, deployment?.codebookId ?? null).data ?? null;
  const publish = usePublishMutation(client);
  const [open, setOpen] = useState(false);

  if (!deployment || !pending) return null;
  const units = pending.units;
  const unitsChanged = units.added > 0 || units.changed > 0 || units.removed > 0 || units.sets;
  const draftValid = draft !== null && codebookErrors(designItems(draft) as TopLevelItem[]).length === 0;
  if (!unitsChanged && draftId === null) return null;

  const parts = [unitsChanged && `units ${describeUnitChanges(units)}`, draftId !== null && `design draft v${versions.numberOf(draftId)}`].filter(Boolean);
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
      <span>
        <strong>Not deployed yet:</strong> {parts.join("; ")}. Coders get what is deployed.
      </span>
      <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
        <Rocket className="mr-1.5 h-4 w-4" /> Deploy…
      </Button>
      {open && (
        <DeployDialog
          client={client}
          open
          codebook={draftValid ? draft : null}
          versionNumber={draftId !== null ? (versions.numberOf(draftId) ?? 0) : 0}
          live={live}
          liveNumber={versions.numberOf(deployment.codebookId)}
          includeCodebook={includeCodebook}
          onDeploy={async (codebook, _note, withUnits) => {
            const codebookId = codebook?.id ?? deployment.codebookId;
            try {
              return await publish.mutateAsync({ codebookId, units: withUnits });
            } catch (err) {
              if (!(err instanceof ResearcherApiError && err.code === "confirm_links") || !confirm(err.reason)) throw err;
              return publish.mutateAsync({ codebookId, units: withUnits, confirmLinks: true });
            }
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
