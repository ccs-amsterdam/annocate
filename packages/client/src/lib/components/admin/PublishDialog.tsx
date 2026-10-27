import { useState } from "react";
import type { CodebookResponse, TopLevelItem } from "@annotinder/contracts";
import { AlertTriangle, Loader2, Rocket } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { diffCodebooks, summarizeChanges, valueChanges, type CodebookChange } from "../../codebook/diff";
import { HelpButton } from "../../help/HelpButton";

interface PublishDialogProps {
  /** The version to publish; the dialog is closed when null. */
  codebook: CodebookResponse | null;
  versionNumber: number;
  /** The version coders use now; null if nothing was published yet. */
  live: CodebookResponse | null;
  liveNumber: number | null;
  /** Publishes the version, after storing `note` on it (empty: no note). */
  onPublish: (codebook: CodebookResponse, note: string) => Promise<{ warnings?: string[] }>;
  onClose: () => void;
}

/**
 * Confirms publishing a codebook version: what changed compared with the
 * live version, and what publishing does to coders and to the version itself
 * (docs/client.md §7). Asks for a version note, prefilled
 * with a summary of the changes. Shows the server's warnings afterwards.
 *
 * Mount it with a `key` per codebook, so the note starts fresh.
 */
export function PublishDialog({ codebook, versionNumber, live, liveNumber, onPublish, onClose }: PublishDialogProps) {
  const [state, setState] = useState<
    { step: "confirm" } | { step: "publishing" } | { step: "done"; warnings: string[] } | { step: "error"; message: string }
  >({ step: "confirm" });

  const changes =
    codebook && live ? diffCodebooks(live.items as TopLevelItem[], codebook.items as TopLevelItem[]) : null;
  const valueWarnings = codebook && live ? valueChanges(live.items as TopLevelItem[], codebook.items as TopLevelItem[]) : [];
  const [note, setNote] = useState(
    () => codebook?.note ?? (changes ? summarizeChanges(changes) : live === null ? "First version" : ""),
  );

  function close() {
    setState({ step: "confirm" });
    onClose();
  }

  async function publish() {
    if (!codebook) return;
    setState({ step: "publishing" });
    try {
      const result = await onPublish(codebook, note.trim());
      if (result.warnings?.length) setState({ step: "done", warnings: result.warnings });
      else close();
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <Dialog open={codebook !== null} onOpenChange={(open) => !open && state.step !== "publishing" && close()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        {state.step === "done" ? (
          <>
            <DialogHeader>
              <DialogTitle>v{versionNumber} is live</DialogTitle>
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
              <DialogTitle>Publish v{versionNumber}?</DialogTitle>
              <DialogDescription>
                {liveNumber !== null
                  ? `Coders are using v${liveNumber} now.`
                  : "Nothing is published yet: after this, coders can start the job."}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto text-sm">
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
              {changes && (
                <section>
                  <h4 className="mb-1.5 font-semibold text-foreground">Changes since v{liveNumber}</h4>
                  {changes.length === 0 ? (
                    <p className="text-muted-foreground">No changes to the items.</p>
                  ) : (
                    <ul className="space-y-1">
                      {changes.map((c) => (
                        <ChangeLine key={`${c.kind}:${c.name}`} change={c} />
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <section>
                <label htmlFor="version-note" className="mb-1.5 block font-semibold text-foreground">
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
                <p className="mt-1 text-xs text-muted-foreground">Shown with v{versionNumber} in the version history.</p>
              </section>

              <section>
                <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
                  What happens <HelpButton topic="changing-a-live-codebook" label="Help: changing a live codebook" />
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-foreground/80">
                  <li>
                    {liveNumber !== null
                      ? `Coders who are working now switch to v${versionNumber} at their next unit; new coders start with it.`
                      : `Coders start with v${versionNumber}.`}
                  </li>
                  {liveNumber !== null && (
                    <li>Answers already given stay linked to the version they were given under.</li>
                  )}
                  <li>
                    v{versionNumber} becomes read only. To change it later, you edit a new draft and publish that.
                  </li>
                </ul>
              </section>

              {state.step === "error" && <p className="text-destructive">{state.message}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={state.step === "publishing"}>
                Cancel
              </Button>
              <Button onClick={() => void publish()} disabled={state.step === "publishing"}>
                {state.step === "publishing" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="mr-1.5 h-4 w-4" />
                )}
                Publish v{versionNumber}
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
