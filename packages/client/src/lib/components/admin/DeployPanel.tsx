import { useState } from "react";
import { designItems, type DesignVersion, type TopLevelItem } from "@annotinder/contracts";
import { describeUnitChanges, hasUnitChanges } from "../../admin/unitChanges";
import { AlertTriangle, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { diffDesigns, summarizeChanges, valueChanges, type DesignChange } from "../../design/diff";
import { InfoTip } from "@/components/ui/info-tip";
import { HelpButton } from "../../help/HelpButton";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { usePendingChangesQuery } from "../../admin/queries";

interface DeployPanelProps {
  client: ResearcherApi;
  /** A design version to deploy (a draft that isn't live); null: none, the live one stays. */
  version: DesignVersion | null;
  versionNumber: number;
  /** The version coders use now; null if nothing was deployed yet. */
  live: DesignVersion | null;
  liveNumber: number | null;
  /**
   * Deploys: the design version (null: keep the live one; its note stored first,
   * empty: none) and the draft units and sets or not.
   */
  onDeploy: (version: DesignVersion | null, note: string, units: boolean) => Promise<unknown>;
}

/**
 * Deploying (docs/architecture.md §8.4): everything is a draft until
 * deployed. Lists both parts, the design draft (what changed compared
 * with the live version, and a version note) and the draft units and sets,
 * each with a checkbox; what is left out stays a draft. The Deploy page's
 * content; the page says when it was deployed.
 *
 * Mount it with a `key` per design version, so the note starts fresh.
 */
export function DeployPanel({ client, version, versionNumber, live, liveNumber, onDeploy }: DeployPanelProps) {
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

  const liveItems = live ? (designItems(live) as TopLevelItem[]) : [];
  const draftItems = version ? (designItems(version) as TopLevelItem[]) : [];
  const changes = version && live ? diffDesigns(liveItems, draftItems) : null;
  const valueWarnings = version && live ? valueChanges(liveItems, draftItems) : [];
  const [note, setNote] = useState(
    () => version?.note ?? (changes ? summarizeChanges(changes) : live === null ? "First version" : ""),
  );
  async function deploy() {
    setState({ step: "deploying" });
    try {
      await onDeploy(deployDesign ? version : null, note.trim(), deployUnits);
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
        <section className="space-y-2 rounded-md border border-border p-3">
          {version ? (
            <label className="flex items-center gap-2 font-semibold text-foreground">
              <input
                type="checkbox"
                checked={deployDesign}
                disabled={firstDeploy}
                onChange={(e) => setWithDesign(e.target.checked)}
              />
              Design v{versionNumber}
            </label>
          ) : (
            <p className="font-semibold text-foreground">Design: v{liveNumber} stays</p>
          )}
          {version && deployDesign && (
            <>
              {valueWarnings.length > 0 && (
                <ul className="space-y-2">
                  {valueWarnings.map((w) => (
                    <li key={w} className="flex gap-2 rounded-md bg-amber-500/10 p-2 text-foreground">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              {changes &&
                (changes.length === 0 ? (
                  <p className="text-muted-foreground">No changes to the items since v{liveNumber}.</p>
                ) : (
                  <ul className="space-y-1">
                    {changes.map((c) => (
                      <ChangeLine key={`${c.kind}:${c.name}`} change={c} />
                    ))}
                  </ul>
                ))}
              <label htmlFor="version-note" className="block font-medium text-foreground">
                What changed? <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="version-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="e.g. Added a question about sources"
                className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              />
            </>
          )}
          {version && !deployDesign && (
            <p className="text-xs text-muted-foreground">The draft stays a draft, for a later deploy.</p>
          )}
        </section>

        <section className="space-y-1 rounded-md border border-border p-3">
          {firstDeploy || unitsChanged ? (
            <label className="flex items-center gap-2 font-semibold text-foreground">
              <input
                type="checkbox"
                checked={deployUnits}
                disabled={firstDeploy}
                onChange={(e) => setWithUnits(e.target.checked)}
              />
              Units and sets
              {unitChanges ? `: ${firstDeploy ? `${unitChanges.added} units` : describeUnitChanges(unitChanges)}` : ""}
            </label>
          ) : (
            <p className="font-semibold text-foreground">Units and sets: no changes</p>
          )}
          {unitsChanged && !deployUnits && (
            <p className="text-xs text-muted-foreground">The units stay drafts, for a later deploy.</p>
          )}
        </section>
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

const KIND_LABEL: Record<DesignChange["kind"], { label: string; className: string }> = {
  added: { label: "Added", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  removed: { label: "Removed", className: "bg-destructive/15 text-destructive" },
  changed: { label: "Changed", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  moved: { label: "Moved", className: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
};

/** One changed item: added, removed, changed or moved, and where. */
function ChangeLine({ change }: { change: DesignChange }) {
  const { label, className } = KIND_LABEL[change.kind];
  const where =
    change.kind === "moved"
      ? change.parent
        ? ` to ${change.parent}`
        : " to the top level"
      : change.parent
        ? ` in ${change.parent}`
        : "";
  return (
    <li className="flex items-center gap-2">
      <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold ${className}`}>
        {label}
      </span>
      <span className="min-w-0 truncate text-foreground">
        <span className="font-mono">{change.name}</span>
        <span className="text-muted-foreground">
          {" "}
          ({change.type.replace("_", " ")}){where}
        </span>
      </span>
    </li>
  );
}
