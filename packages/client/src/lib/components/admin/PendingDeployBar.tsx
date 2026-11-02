import { useState } from "react";
import { codebookErrors, designItems, undeclaredFields, type TopLevelItem } from "@annotinder/contracts";
import { Rocket } from "lucide-react";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useDesignVersionQuery, useDesignVersionsQuery, useDeploymentQuery, usePendingChangesQuery, usePublishMutation, useUpdateDesignVersionMutation } from "../../admin/queries";
import { describeVersions } from "../../design/versions";
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
  const codebooksQuery = useDesignVersionsQuery(client);
  const codebooks = codebooksQuery.data ?? [];
  const versions = describeVersions(codebooks, deployment?.designVersionId ?? null);
  // Only a draft (not frozen) codebook is offered: an older version is restored from the editor first.
  const draftId = pending?.designVersionId !== null && pending?.designVersionId === versions.draftId ? versions.draftId : null;
  const draft = useDesignVersionQuery(client, draftId).data ?? null;
  const live = useDesignVersionQuery(client, deployment?.designVersionId ?? null).data ?? null;
  const publish = usePublishMutation(client);
  const updateDesignVersion = useUpdateDesignVersionMutation(client);
  const [open, setOpen] = useState(false);

  // The versions are needed to number them (and not take a deployed job for a first deploy)
  if (!deployment || !pending || !codebooksQuery.data) return null;
  const units = pending.units;
  const unitsChanged = units.added > 0 || units.changed > 0 || units.removed > 0 || units.sets;
  // As the server checks it: no errors, and every unit field it uses declared
  const draftValid =
    draft !== null && codebookErrors(designItems(draft) as TopLevelItem[]).length === 0 && undeclaredFields(designItems(draft), draft.units.fields).length === 0;
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
          liveNumber={versions.numberOf(deployment.designVersionId)}
          includeCodebook={includeCodebook}
          onDeploy={async (codebook, note, withUnits) => {
            if (codebook && note !== (codebook.note ?? "")) {
              await updateDesignVersion.mutateAsync({ id: codebook.id, body: { note: note || undefined, items: codebook.items, revision: codebook.revision } });
            }
            const designVersionId = codebook?.id ?? deployment.designVersionId;
            try {
              return await publish.mutateAsync({ designVersionId, units: withUnits });
            } catch (err) {
              if (!(err instanceof ResearcherApiError && err.code === "confirm_links") || !confirm(err.reason)) throw err;
              return publish.mutateAsync({ designVersionId, units: withUnits, confirmLinks: true });
            }
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
