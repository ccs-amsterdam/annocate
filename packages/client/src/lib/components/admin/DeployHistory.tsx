import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useDeploymentVersionsQuery, useDesignVersionsQuery } from "../../admin/queries";
import { describeVersions } from "../../design/versions";
import { formatWhen } from "../../admin/format";
import { describeUnitChanges } from "../../admin/unitChanges";

/**
 * The deploys, newest first (docs/architecture.md §8.4): which design version
 * each made live (with its note), what changed in the units, when, and on
 * which release. Deploys are numbered on their own (#3), design versions as
 * v2.
 */
export function DeployHistory({ client }: { client: ResearcherApi }) {
  const deploys = useDeploymentVersionsQuery(client).data ?? [];
  const designVersions = useDesignVersionsQuery(client).data ?? [];
  const versions = describeVersions(designVersions, deploys[0]?.designVersionId ?? null);
  if (deploys.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1 text-sm" aria-label="Deploys">
      {deploys.map((v, i) => {
        const note = designVersions.find((d) => d.id === v.designVersionId)?.note;
        const parts = [
          v.changes.design && `design v${versions.numberOf(v.designVersionId) ?? "?"}`,
          v.changes.units && `units: ${describeUnitChanges(v.changes.units)}`,
        ].filter(Boolean);
        return (
          // The current deploy: a faint leaf tint
          <li key={v.version} className={`flex flex-col rounded-md px-2 py-1 ${i === 0 ? "bg-leaf/10" : ""}`}>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs text-muted-foreground">#{v.version}</span>
              <span>{parts.length > 0 ? parts.join("; ") : "settings only"}</span>
              <span className="text-xs text-muted-foreground">{formatWhen(v.created)}</span>
              {v.client && (
                <span
                  className="text-xs text-muted-foreground"
                  title={`AnnoTinder ${v.client.release}, commit ${v.client.commit}`}
                >
                  on {v.client.release}
                </span>
              )}
            </span>
            {v.changes.design && note && <span className="text-xs text-muted-foreground">{note}</span>}
          </li>
        );
      })}
    </ol>
  );
}
