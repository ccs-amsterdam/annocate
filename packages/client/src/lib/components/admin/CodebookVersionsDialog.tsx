import type { CodebookMeta } from "@annotinder/contracts";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History, Info, CircleDot, FilePen, Clock, Eye, RotateCcw, Trash2, AlertCircle } from "lucide-react";
import type { CodebookVersions } from "../../codebook/versions";

export interface CodebookVersionsViewProps {
  codebooks: CodebookMeta[];
  versions: CodebookVersions;
  /** Id of the version open in the editor; null for a new, unsaved codebook. */
  openId: number | null;
  onView: (id: number) => void;
  onRestore: (id: number) => void;
  /** Deletes the draft (asks for confirmation). */
  onDeleteDraft?: (id: number) => void;
  onClose?: () => void;
}

export function CodebookVersionsView({ codebooks, versions, openId, onView, onRestore, onDeleteDraft, onClose }: CodebookVersionsViewProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h2 className="flex shrink-0 items-center gap-2 pr-8 text-lg font-bold text-foreground">
        <History className="h-5 w-5 text-primary" />
        Codebook versions
      </h2>

      <div className="mt-3 shrink-0 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs leading-relaxed text-foreground">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1 text-foreground/80">
            <p>
              Coders use the <strong className="text-foreground">live</strong> version. You edit a{" "}
              <strong className="text-foreground">draft</strong>, and it only reaches coders when you publish it.
            </p>
            <p>
              Published versions are read only, so every answer stays linked to the exact version it was given
              under. To go back to an older version, restore it as the draft and publish that.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-3 pr-1">
        {codebooks.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No saved versions yet.</div>
        ) : (
          codebooks
            .slice()
            .reverse()
            .map((cb) => {
              const status = versions.statusOf(cb.id);
              const isOpen = cb.id === openId;
              const formattedDate = new Date(cb.created).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              });

              return (
                <div
                  key={cb.id}
                  className={`flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-all sm:flex-row sm:items-center ${
                    isOpen ? "border-primary/50 bg-primary/5 shadow-xs" : "border-border/70 bg-card hover:border-border"
                  }`}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">v{versions.numberOf(cb.id)}</span>
                      {status === "live" && (
                        <span className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          <CircleDot className="h-3 w-3" />
                          Live
                        </span>
                      )}
                      {status === "draft" && (
                        <span className="flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                          <FilePen className="h-3 w-3" />
                          Draft
                        </span>
                      )}
                      {isOpen && (
                        <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          In editor
                        </span>
                      )}
                    </div>
                    {cb.note && <p className="text-sm text-foreground/80">{cb.note}</p>}
                    <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {status === "draft"
                          ? `Saved ${new Date(cb.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}${cb.updatedBy ? ` by ${cb.updatedBy}` : ""}`
                          : `Created ${formattedDate}`}
                      </span>
                    </div>
                    {!cb.valid && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Has issues: fix them before publishing
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {status === "draft" && onDeleteDraft && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onDeleteDraft(cb.id)}
                        title="Delete this draft for everyone: the saved changes in it are lost"
                        className="h-8 border-destructive/40 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete draft
                      </Button>
                    )}
                    {status !== "draft" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onClose?.();
                          onRestore(cb.id);
                        }}
                        title="Copy this version into the draft"
                        className="h-8 text-xs font-medium"
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Restore as draft
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={isOpen ? "secondary" : "default"}
                      size="sm"
                      disabled={isOpen}
                      onClick={() => {
                        onClose?.();
                        onView(cb.id);
                      }}
                      className="h-8 text-xs font-medium"
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {isOpen ? "Open" : status === "draft" ? "Edit" : "View"}
                    </Button>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}

export interface CodebookVersionsDialogProps extends CodebookVersionsViewProps {
  open: boolean;
  onClose: () => void;
}

export function CodebookVersionsDialog({ open, onClose, ...props }: CodebookVersionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-6 sm:max-w-2xl">
        <CodebookVersionsView {...props} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
