import { Rocket } from "lucide-react";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useDeploymentQuery, useDesignVersionsQuery, usePendingChangesQuery } from "../../admin/queries";
import { describeVersions } from "../../design/versions";
import { Button } from "@/components/ui/button";
import { describeUnitChanges, hasUnitChanges } from "../../admin/unitChanges";

/**
 * Everything is a draft until deployed (docs/architecture.md §8.4): when a
 * deployed study's drafts differ from what coders get, says what differs,
 * with the way to the Deploy page.
 */
export function PendingDeployBar({ client, onOpenDeploy }: { client: ResearcherApi; onOpenDeploy: () => void }) {
  const deployment = useDeploymentQuery(client).data;
  const pending = usePendingChangesQuery(client, !!deployment).data;
  const designVersionsQuery = useDesignVersionsQuery(client);
  const versions = describeVersions(designVersionsQuery.data ?? [], deployment?.designVersionId ?? null);
  // Only a draft (not frozen) design version counts: an older version is restored in the editor first
  const draftId =
    pending?.designVersionId !== null && pending?.designVersionId === versions.draftId ? versions.draftId : null;

  if (!deployment || !pending || !designVersionsQuery.data) return null;
  const unitsChanged = hasUnitChanges(pending.units);
  if (!unitsChanged && draftId === null) return null;
  const parts = [
    unitsChanged && `units ${describeUnitChanges(pending.units)}`,
    draftId !== null && `design draft v${versions.numberOf(draftId)}`,
  ].filter(Boolean);
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm"
    >
      <span>
        <strong>Not deployed yet:</strong> {parts.join("; ")}.
      </span>
      <Button size="sm" className="ml-auto h-7" onClick={onOpenDeploy}>
        <Rocket className="mr-1.5 h-4 w-4" /> Review and deploy
      </Button>
    </div>
  );
}
