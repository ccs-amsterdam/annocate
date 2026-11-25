import { useState } from "react";
import {
  DEFAULT_NEW_UNITS_MESSAGE,
  designItems,
  inviteOf,
  sessionItem,
  type DesignVersion,
  type TopLevelItem,
} from "@annotinder/contracts";
import { hasUnitChanges } from "../../admin/unitChanges";
import { firstDeployReopenMinutes } from "../../admin/deploy";
import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { diffDesigns, summarizeChanges, valueChanges, type DesignChange } from "../../design/diff";
import { InfoTip } from "@/components/ui/info-tip";
import { HelpButton } from "../../help/HelpButton";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCodersQuery, useDeploymentQuery, usePendingChangesQuery } from "../../admin/queries";
import { deployDeletesText, unusedExperts } from "../../admin/whoCodes";
import { DesignToDeploy } from "./deploy/DesignToDeploy";
import { FirstDeploySettings } from "./deploy/FirstDeploySettings";
import { NewUnitsMessage, UnitsToDeploy } from "./deploy/UnitsToDeploy";

/** Settings deployed with this deploy: left out, unchanged. */
interface DeploySettings {
  /** The study's `reopenMinutes` (the first deploy asks). */
  reopenMinutes?: number | null;
  /** What returning coders who got new units are told; null: nothing. */
  newUnitsMessage?: string | null;
}

interface DeployPanelProps {
  client: ResearcherApi;
  /** "When coders finish" in the study's Settings: where the first deploy's choice starts. */
  studyReopenMinutes: number | null;
  /** A design version to deploy (a draft that isn't live); null: none, the live one stays. */
  version: DesignVersion | null;
  versionNumber: number;
  /** The version coders use now; null if nothing was deployed yet. */
  live: DesignVersion | null;
  liveNumber: number | null;
  /**
   * Deploys: the design version (null: keep the live one; its note stored first,
   * empty: none), the draft units and sets or not, and the settings.
   */
  onDeploy: (version: DesignVersion | null, note: string, units: boolean, settings: DeploySettings) => Promise<unknown>;
}

/**
 * Deploying (docs/architecture.md §8.4): everything is a draft until
 * deployed. Lists both parts, the design draft (what changed compared
 * with the live version, and a version note) and the draft units and sets,
 * each with a checkbox; what is left out stays a draft. The first deploy
 * also asks what happens when coders finish (by default: coder links stay
 * open, one link closes after a day), and says which expert coders a
 * crowd's first deploy deletes. Deploying units asks what returning
 * coders who get new ones are told. The Deploy page's content; the page
 * says when it was deployed.
 *
 * Mount it with a `key` per design version (`deployPanelKey`), so the note
 * starts fresh.
 */
export function DeployPanel({
  client,
  studyReopenMinutes,
  version,
  versionNumber,
  live,
  liveNumber,
  onDeploy,
}: DeployPanelProps) {
  const [state, setState] = useState<{ step: "confirm" } | { step: "deploying" } | { step: "error"; message: string }>({
    step: "confirm",
  });
  const pending = usePendingChangesQuery(client).data;
  const firstDeploy = liveNumber === null;
  const unitChanges = pending?.units ?? null;
  const unitsChanged = unitChanges !== null && hasUnitChanges(unitChanges);
  const [withDesign, setWithDesign] = useState(true);
  const [withUnits, setWithUnits] = useState(true);
  const deployDesign = version !== null && (withDesign || firstDeploy);
  const deployUnits = firstDeploy || (unitsChanged && withUnits);
  const crowd = version !== null && inviteOf(sessionItem(designItems(version)))?.mode === "crowd";
  const [reopenMinutes, setReopenMinutes] = useState(() => firstDeployReopenMinutes(studyReopenMinutes, crowd));
  // A crowd's first deploy fixes who codes: expert coders made before go (the server deletes them)
  const coders = useCodersQuery(client).data?.coders ?? [];
  const deletes = deployDeletesText(firstDeploy && crowd ? unusedExperts(coders, "crowd") : []);
  const currentMessage = useDeploymentQuery(client).data?.newUnitsMessage;
  const [message, setMessage] = useState<string | null>(null);
  const newUnitsMessage = message ?? (firstDeploy ? DEFAULT_NEW_UNITS_MESSAGE : (currentMessage ?? ""));

  const liveItems = live ? (designItems(live) as TopLevelItem[]) : [];
  const draftItems = version ? (designItems(version) as TopLevelItem[]) : [];
  const changes = version && live ? diffDesigns(liveItems, draftItems) : null;
  const valueWarnings = version && live ? valueChanges(liveItems, draftItems) : [];
  const [note, setNote] = useState(() => version?.note ?? suggestedNote(changes, live === null));
  async function deploy() {
    setState({ step: "deploying" });
    try {
      await onDeploy(deployDesign ? version : null, note.trim(), deployUnits, {
        ...(firstDeploy ? { reopenMinutes } : {}),
        ...(message !== null ? { newUnitsMessage: message.trim() || null } : {}),
      });
      setState({ step: "confirm" });
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const nothing = !deployDesign && !deployUnits;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-medium">Deploy</h2>
        <p className="text-sm text-muted-foreground">
          {firstDeploy
            ? "Nothing is deployed yet: after this, coders can start the study."
            : `Coders use v${liveNumber} now. Everything you edit is a draft until you deploy it; what you leave out stays a draft.`}
        </p>
      </div>
      <div className="space-y-4 text-sm">
        <DesignToDeploy
          versionNumber={version ? versionNumber : null}
          liveNumber={liveNumber}
          included={deployDesign}
          onIncludedChange={setWithDesign}
          changes={changes}
          valueWarnings={valueWarnings}
          note={note}
          onNoteChange={setNote}
        />
        <UnitsToDeploy
          changes={unitChanges}
          changed={unitsChanged}
          firstDeploy={firstDeploy}
          included={deployUnits}
          onIncludedChange={setWithUnits}
        >
          {!firstDeploy && <NewUnitsMessage value={newUnitsMessage} onChange={setMessage} />}
        </UnitsToDeploy>
        {firstDeploy && (
          <FirstDeploySettings
            reopenMinutes={reopenMinutes}
            onReopenMinutesChange={setReopenMinutes}
            newUnitsMessage={newUnitsMessage}
            onNewUnitsMessageChange={setMessage}
          />
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          What happens when you deploy
          <InfoTip label="What happens when you deploy">
            <ul className="list-disc space-y-1 pl-4">
              <li>
                {firstDeploy
                  ? "Coders can start."
                  : "Coders who are working now switch to it when they next save an answer; new coders start with it."}
              </li>
              {!firstDeploy && (
                <li>Answers already given stay linked to the design version and unit versions they were given with.</li>
              )}
              {deployDesign && (
                <li>
                  Design v{versionNumber} becomes read only. To change it later, you edit a new draft and deploy that.
                </li>
              )}
            </ul>
          </InfoTip>
          <HelpButton topic="changing-a-live-design" label="Help: changing a live design" />
        </div>

        {deletes && (
          <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5">
            {deletes}: this first deploy fixes who codes as a crowd, which has no expert coders.
          </p>
        )}
        {state.step === "error" && <p className="text-destructive">{state.message}</p>}
      </div>

      <div>
        <Button
          onClick={() => void deploy()}
          disabled={state.step === "deploying" || nothing || (!firstDeploy && !pending)}
        >
          {state.step === "deploying" ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="mr-1.5 h-4 w-4" />
          )}
          Deploy
        </Button>
      </div>
    </div>
  );
}

/** The note a version without one starts with: what changed since the live version, or that it is the first. */
function suggestedNote(changes: DesignChange[] | null, first: boolean): string {
  if (changes) return summarizeChanges(changes);
  return first ? "First version" : "";
}
