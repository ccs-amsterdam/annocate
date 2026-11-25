import { useState } from "react";
import { AlertTriangle, CircleCheck, CircleDot, Loader2 } from "lucide-react";
import {
  NO_INVITE,
  deployErrors,
  designItems,
  inviteOf,
  sessionItem,
  undeclaredFields,
  type TopLevelItem,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useConfirmedDeploy,
  useDeploymentQuery,
  useDesignVersionQuery,
  useDesignVersionsQuery,
  usePendingChangesQuery,
  useStudyQuery,
  useUpdateDesignVersionMutation,
  useUpdateStudyMutation,
} from "../../admin/queries";
import { describeVersions } from "../../design/versions";
import { hasUnitChanges } from "../../admin/unitChanges";
import { deployPanelKey } from "../../admin/deploy";
import { Button } from "@/components/ui/button";
import { DeployPanel } from "./DeployPanel";
import { DeployHistory } from "./DeployHistory";
import { LiveControls } from "./LiveControls";
import { InviteChecks } from "./coders/InviteChecks";
import { UnassignedNotice } from "./coders/UnassignedNotice";

/**
 * Deploy › Deploy (docs/client.md §7, "Versions and deploying"): what is
 * saved but not deployed yet (the design's draft, draft units and sets), and
 * deploying it. The editor only saves; deploying happens here. With expert
 * coders, also what deploying asks of them (an email address where they
 * sign in) and the units no coder has, with the way to the Coders page.
 */
export function DeployPage({
  client,
  onOpenDesign,
  onOpenCoders,
}: {
  client: ResearcherApi;
  onOpenDesign: () => void;
  onOpenCoders: () => void;
}) {
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
  const study = useStudyQuery(client).data ?? null;
  const updateStudy = useUpdateStudyMutation(client);
  // The last deploy's warnings: shown after the page has moved on to what is (not) deployed now
  const [deployed, setDeployed] = useState<string[] | null>(null);

  // The study too: the panel starts from its settings
  if (deploymentQuery.isLoading || designVersionsQuery.isLoading || (candidateId !== null && !candidate) || !study)
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );

  const liveNumber = deployment ? versions.numberOf(deployment.designVersionId) : null;
  const candidateNumber = candidateId !== null ? (versions.numberOf(candidateId) ?? 0) : 0;
  // As the server checks it: no errors, and every unit field it uses declared
  const candidateErrors = candidate ? deployErrors(designItems(candidate) as TopLevelItem[]) : [];
  const problems =
    candidate !== null &&
    (candidateErrors.length > 0 || undeclaredFields(designItems(candidate), candidate.units.fields).length > 0);
  // Who codes isn't chosen: said as it is, not as "problems"
  const noInvite = candidateErrors.length === 1 && candidateErrors[0].message === NO_INVITE;
  const unitsChanged = !!pending && hasUnitChanges(pending.units);
  // Who codes in what would be deployed: the candidate's choice, else the live design's
  const toDeploy = candidate ?? live;
  const invite = toDeploy ? inviteOf(sessionItem(designItems(toDeploy))) : null;
  const openCoders = (
    <Button variant="link" className="h-auto p-0" onClick={onOpenCoders}>
      Open Coders
    </Button>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Pausing the live study: here, with deploying, not on the overview (it stops coders) */}
      {deployment && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <span>
            {deployment.active
              ? "The study is live: coders get units."
              : "The study is paused: coders get no new units until you resume it."}
          </span>
          <LiveControls client={client} deployment={deployment} />
        </section>
      )}
      {deployed && (
        <section className="flex flex-col gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <h2 className="flex items-center gap-1.5 font-medium">
            <CircleCheck className="h-4 w-4 text-emerald-600" /> Deployed
          </h2>
          {deployed.map((w, i) => (
            <p key={i} className="flex gap-2 rounded-md bg-amber-500/10 p-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              {w}
            </p>
          ))}
        </section>
      )}
      {/* Also when everything is deployed: deleting a coder leaves deployed units without one */}
      <InviteChecks client={client} invite={invite} />
      <UnassignedNotice client={client}>{openCoders}</UnassignedNotice>
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
              {noInvite
                ? `Design v${candidateNumber}: choose who codes (expert coders or a crowd) before deploying it.`
                : `Design v${candidateNumber} has problems: fix them before deploying it.`}{" "}
              <Button variant="link" className="h-auto p-0" onClick={onOpenDesign}>
                Open the design
              </Button>
            </div>
          )}
          <DeployPanel
            key={deployPanelKey(candidate)}
            client={client}
            studyReopenMinutes={study.reopenMinutes}
            version={problems ? null : candidate}
            versionNumber={candidateNumber}
            live={live}
            liveNumber={liveNumber}
            onDeploy={async (version, note, units, settings) => {
              if (settings.reopenMinutes !== undefined && settings.reopenMinutes !== study.reopenMinutes) {
                await updateStudy.mutateAsync({
                  id: study.id,
                  body: { name: study.name, archived: study.archived, reopenMinutes: settings.reopenMinutes },
                });
              }
              if (version && note !== (version.note ?? "")) {
                await updateDesignVersion.mutateAsync({
                  id: version.id,
                  body: { note: note || undefined, items: version.items, revision: version.revision },
                });
              }
              const result = await deploy({
                designVersionId: version?.id ?? deployment!.designVersionId,
                units,
                ...(settings.newUnitsMessage !== undefined ? { newUnitsMessage: settings.newUnitsMessage } : {}),
              });
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
