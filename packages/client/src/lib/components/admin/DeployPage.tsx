import { useState } from "react";
import { AlertTriangle, CircleCheck, CircleDot, Loader2 } from "lucide-react";
import { designErrors, designItems, undeclaredFields, type TopLevelItem } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useConfirmedDeploy,
  useDeploymentQuery,
  useDesignVersionQuery,
  useDesignVersionsQuery,
  usePendingChangesQuery,
  useUpdateDesignVersionMutation,
} from "../../admin/queries";
import { describeVersions } from "../../design/versions";
import { hasUnitChanges } from "../../admin/unitChanges";
import { Button } from "@/components/ui/button";
import { DeployPanel } from "./DeployPanel";
import { DeployHistory } from "./DeployHistory";

/**
 * Deploy › Deploy (docs/client.md §7, "Versions and deploying"): what is
 * saved but not deployed yet (the design's draft, draft units and sets), and
 * deploying it. The editor only saves; deploying happens here.
 */
export function DeployPage({ client, onOpenDesign }: { client: ResearcherApi; onOpenDesign: () => void }) {
  const deploymentQuery = useDeploymentQuery(client);
  const deployment = deploymentQuery.data ?? null;
  const designVersionsQuery = useDesignVersionsQuery(client);
  const designVersions = designVersionsQuery.data ?? [];
  const versions = describeVersions(designVersions, deployment?.designVersionId ?? null);
  const pending = usePendingChangesQuery(client, !!deployment).data;
  // Before the first deploy, the latest version; after it, the draft (an older version is restored in the editor first)
  const candidateId = deployment ? versions.draftId : versions.currentId;
  const candidate = useDesignVersionQuery(client, candidateId).data ?? null;
  const live = useDesignVersionQuery(client, deployment?.designVersionId ?? null).data ?? null;
  const deploy = useConfirmedDeploy(client);
  const updateDesignVersion = useUpdateDesignVersionMutation(client);
  // The last deploy's warnings: shown after the page has moved on to what is (not) deployed now
  const [deployed, setDeployed] = useState<string[] | null>(null);

  if (deploymentQuery.isLoading || designVersionsQuery.isLoading || (candidateId !== null && !candidate))
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );

  const liveNumber = deployment ? versions.numberOf(deployment.designVersionId) : null;
  const candidateNumber = candidateId !== null ? (versions.numberOf(candidateId) ?? 0) : 0;
  // As the server checks it: no errors, and every unit field it uses declared
  const problems =
    candidate !== null &&
    (designErrors(designItems(candidate) as TopLevelItem[]).length > 0 ||
      undeclaredFields(designItems(candidate), candidate.units.fields).length > 0);
  const unitsChanged = !!pending && hasUnitChanges(pending.units);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {deployed && (
        <section className="flex flex-col gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <h2 className="flex items-center gap-1.5 font-medium">
            <CircleCheck className="h-4 w-4 text-emerald-600" /> Deployed
          </h2>
          {deployed.map((w) => (
            <p key={w} className="flex gap-2 rounded-md bg-amber-500/10 p-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              {w}
            </p>
          ))}
        </section>
      )}
      {candidate === null && !unitsChanged && deployment ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm">
          <CircleDot className="h-4 w-4 text-ember" />
          Everything is deployed: coders use v{liveNumber}. Edit the design or the units to change it.
        </div>
      ) : candidate === null && !deployment ? (
        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          Nothing to deploy yet: save a design first.{" "}
          <Button variant="link" className="h-auto p-0" onClick={onOpenDesign}>
            Open the design
          </Button>
        </div>
      ) : (
        <>
          {problems && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              Design v{candidateNumber} has problems: fix them before deploying it.{" "}
              <Button variant="link" className="h-auto p-0" onClick={onOpenDesign}>
                Open the design
              </Button>
            </div>
          )}
          <DeployPanel
            key={`${candidate?.id ?? "none"}:${candidate?.revision ?? 0}`}
            client={client}
            version={problems ? null : candidate}
            versionNumber={candidateNumber}
            live={live}
            liveNumber={liveNumber}
            onDeploy={async (version, note, units) => {
              if (version && note !== (version.note ?? "")) {
                await updateDesignVersion.mutateAsync({
                  id: version.id,
                  body: { note: note || undefined, items: version.items, revision: version.revision },
                });
              }
              const result = await deploy({ designVersionId: version?.id ?? deployment!.designVersionId, units });
              setDeployed(result.warnings ?? []);
              return result;
            }}
          />
        </>
      )}
      {deployment && (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">
            Deploys <span className="font-normal text-muted-foreground">what each deploy made live, with its note</span>
          </h2>
          <DeployHistory client={client} />
        </section>
      )}
    </div>
  );
}
