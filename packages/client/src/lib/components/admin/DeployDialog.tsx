import { useState } from "react";
import { designItems, type DesignVersion, type TopLevelItem, type UnitChanges } from "@annotinder/contracts";
import { AlertTriangle, Loader2, Rocket } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { diffCodebooks, summarizeChanges, valueChanges, type CodebookChange } from "../../codebook/diff";
import { HelpButton } from "../../help/HelpButton";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { usePendingChangesQuery } from "../../admin/queries";

interface DeployDialogProps {
  client: ResearcherApi;
  open: boolean;
  /** A design version to deploy (a draft that isn't live); null: none, the live one stays. */
  codebook: DesignVersion | null;
  versionNumber: number;
  /** The version coders use now; null if nothing was deployed yet. */
  live: DesignVersion | null;
  liveNumber: number | null;
  /** Whether the codebook part starts ticked (the editor's Deploy: yes; after uploading units: no). */
  includeCodebook?: boolean;
  /**
   * Deploys: the codebook (null: keep the live one; its note stored first,
   * empty: none) and the draft units and sets or not.
   */
  onDeploy: (codebook: DesignVersion | null, note: string, units: boolean) => Promise<{ warnings?: string[] }>;
  onClose: () => void;
}

/** "3 added, 1 changed, sets changed": a unit change summary. */
export function describeUnitChanges(c: UnitChanges): string {
  const parts = [
    c.added > 0 && `${c.added} added`,
    c.changed > 0 && `${c.changed} changed`,
    c.removed > 0 && `${c.removed} removed`,
    c.sets && "sets changed",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "no changes";
}

/**
 * Deploying (docs/plans/design.md §5): everything is a draft until
 * deployed. Lists both parts, the design draft (what changed compared
 * with the live version, and a version note) and the draft units and sets,
 * each with a checkbox; what is left out stays a draft. Shows the server's
 * warnings afterwards.
 *
 * Mount it with a `key` per codebook, so the note starts fresh.
 */
export function DeployDialog({ client, open, codebook, versionNumber, live, liveNumber, includeCodebook = true, onDeploy, onClose }: DeployDialogProps) {
  const [state, setState] = useState<
    { step: "confirm" } | { step: "publishing" } | { step: "done"; warnings: string[] } | { step: "error"; message: string }
  >({ step: "confirm" });
  const pending = usePendingChangesQuery(client, open).data;
  const firstDeploy = liveNumber === null;
  const unitChanges = pending?.units ?? null;
  const hasUnitChanges = unitChanges !== null && (unitChanges.added > 0 || unitChanges.changed > 0 || unitChanges.removed > 0 || unitChanges.sets);
  const [withCodebook, setWithCodebook] = useState(includeCodebook || firstDeploy);
  const [withUnits, setWithUnits] = useState(true);
  const useCodebook = codebook !== null && (withCodebook || firstDeploy);
  const useUnits = firstDeploy || (hasUnitChanges && withUnits);

  const liveItems = live ? (designItems(live) as TopLevelItem[]) : [];
  const draftItems = codebook ? (designItems(codebook) as TopLevelItem[]) : [];
  const changes = codebook && live ? diffCodebooks(liveItems, draftItems) : null;
  const valueWarnings = codebook && live ? valueChanges(liveItems, draftItems) : [];
  const [note, setNote] = useState(() => codebook?.note ?? (changes ? summarizeChanges(changes) : live === null ? "First version" : ""));

  function close() {
    setState({ step: "confirm" });
    onClose();
  }

  async function deploy() {
    setState({ step: "publishing" });
    try {
      const result = await onDeploy(useCodebook ? codebook : null, note.trim(), useUnits);
      if (result.warnings?.length) setState({ step: "done", warnings: result.warnings });
      else close();
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const nothing = !useCodebook && !useUnits;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && state.step !== "publishing" && close()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        {state.step === "done" ? (
          <>
            <DialogHeader>
              <DialogTitle>Deployed</DialogTitle>
              <DialogDescription>Please note:</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm">
              {state.warnings.map((w) => (
                <li key={w} className="flex gap-2 rounded-md bg-amber-500/10 p-2 text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  {w}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={close}>OK</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Deploy changes?</DialogTitle>
              <DialogDescription>
                {firstDeploy
                  ? "Nothing is deployed yet: after this, coders can start the job."
                  : `Coders use v${liveNumber} now. Everything you edit is a draft until you deploy it; what you leave out stays a draft.`}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto text-sm">
              <section className="space-y-2 rounded-md border border-border p-3">
                {codebook ? (
                  <label className="flex items-center gap-2 font-semibold text-foreground">
                    <input type="checkbox" checked={useCodebook} disabled={firstDeploy} onChange={(e) => setWithCodebook(e.target.checked)} />
                    Design v{versionNumber}
                  </label>
                ) : (
                  <p className="font-semibold text-foreground">Design: v{liveNumber} stays</p>
                )}
                {codebook && useCodebook && (
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
                {codebook && !useCodebook && <p className="text-xs text-muted-foreground">The draft stays a draft, for a later deploy.</p>}
              </section>

              <section className="space-y-1 rounded-md border border-border p-3">
                {firstDeploy || hasUnitChanges ? (
                  <label className="flex items-center gap-2 font-semibold text-foreground">
                    <input type="checkbox" checked={useUnits} disabled={firstDeploy} onChange={(e) => setWithUnits(e.target.checked)} />
                    Units and sets{unitChanges ? `: ${firstDeploy ? `${unitChanges.added} units` : describeUnitChanges(unitChanges)}` : ""}
                  </label>
                ) : (
                  <p className="font-semibold text-foreground">Units and sets: no changes</p>
                )}
                {hasUnitChanges && !useUnits && <p className="text-xs text-muted-foreground">The units stay drafts, for a later deploy.</p>}
              </section>

              <section>
                <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
                  What happens <HelpButton topic="changing-a-live-codebook" label="Help: changing a live codebook" />
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-foreground/80">
                  <li>{firstDeploy ? "Coders can start." : "Coders who are working now switch to it when they next save an answer; new coders start with it."}</li>
                  {!firstDeploy && <li>Answers already given stay linked to the design version and unit versions they were given with.</li>}
                  {useCodebook && <li>Design v{versionNumber} becomes read only. To change it later, you edit a new draft and deploy that.</li>}
                </ul>
              </section>

              {state.step === "error" && <p className="text-destructive">{state.message}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={state.step === "publishing"}>
                Cancel
              </Button>
              <Button onClick={() => void deploy()} disabled={state.step === "publishing" || nothing || (!firstDeploy && !pending)}>
                {state.step === "publishing" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Rocket className="mr-1.5 h-4 w-4" />}
                Deploy
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const KIND_LABEL: Record<CodebookChange["kind"], { label: string; className: string }> = {
  added: { label: "Added", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  removed: { label: "Removed", className: "bg-destructive/15 text-destructive" },
  changed: { label: "Changed", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  moved: { label: "Moved", className: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
};

function ChangeLine({ change }: { change: CodebookChange }) {
  const { label, className } = KIND_LABEL[change.kind];
  const where = change.kind === "moved" ? (change.parent ? ` to ${change.parent}` : " to the top level") : change.parent ? ` in ${change.parent}` : "";
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
