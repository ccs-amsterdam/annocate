import type { CodebookMeta } from "@annotinder/contracts";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  History,
  Info,
  CheckCircle,
  Lock,
  Clock,
  Plus,
  Copy,
  FileEdit,
} from "lucide-react";

export interface CodebookVersionsViewProps {
  codebooks: CodebookMeta[];
  currentVersion: number | "new" | "duplicate";
  latestCodebookId: number | null;
  onSelectVersion: (id: number) => void;
  onCreateNewVersion: () => void;
  onDuplicateVersion: (meta: CodebookMeta) => void;
  onClose?: () => void;
}

export function CodebookVersionsView({
  codebooks,
  currentVersion,
  latestCodebookId,
  onSelectVersion,
  onCreateNewVersion,
  onDuplicateVersion,
  onClose,
}: CodebookVersionsViewProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 flex items-center justify-between pr-8">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <History className="h-5 w-5 text-primary" />
          Codebook Versions
        </h2>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onClose?.();
            onCreateNewVersion();
          }}
          className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          New Version
        </Button>
      </div>

      {/* Informative Explanation Callout */}
      <div className="shrink-0 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs leading-relaxed text-foreground mt-3">
        <div className="flex items-start gap-2.5">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              About Codebook Versions &amp; Provenance
            </p>
            <p className="text-muted-foreground">
              There is <strong>one active version</strong> (the latest version created) used by coders in active sessions. You can store different versions for development and testing. Once a codebook version has been used to collect annotations, it is <strong>made immutable</strong> to ensure the provenance and scientific reproducibility of the annotations.
            </p>
          </div>
        </div>
      </div>

      {/* Versions List */}
      <div className="flex-1 overflow-y-auto space-y-2 py-3 pr-1">
        {codebooks.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No saved versions yet.
          </div>
        ) : (
          codebooks
            .slice()
            .reverse()
            .map((cb, revIdx) => {
              const versionNum = codebooks.length - revIdx;
              const isLatest = cb.id === latestCodebookId;
              const isCurrentlyOpen = cb.id === currentVersion;
              const formattedDate = new Date(cb.created).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              });

              return (
                <div
                  key={cb.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                    isCurrentlyOpen
                      ? "border-primary/50 bg-primary/5 shadow-xs"
                      : "border-border/70 bg-card hover:border-border"
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground truncate">
                        v{versionNum} &middot; {cb.name}
                      </span>
                      {isLatest && (
                        <span className="flex items-center gap-1 rounded-md bg-teal-500/10 px-2 py-0.5 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                          <CheckCircle className="h-3 w-3" />
                          Active Version
                        </span>
                      )}
                      {cb.immutable ? (
                        <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          Immutable
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          Draft
                        </span>
                      )}
                      {isCurrentlyOpen && (
                        <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          In Editor
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>Created {formattedDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onClose?.();
                        onDuplicateVersion(cb);
                      }}
                      title="Duplicate as a new version draft"
                      className="h-8 text-xs font-medium cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Duplicate
                    </Button>

                    {isCurrentlyOpen ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled
                        className="h-8 text-xs font-medium opacity-60"
                      >
                        Viewing
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => {
                          onClose?.();
                          onSelectVersion(cb.id);
                        }}
                        className="h-8 text-xs font-medium cursor-pointer"
                      >
                        <FileEdit className="h-3.5 w-3.5 mr-1" />
                        Open
                      </Button>
                    )}
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

export function CodebookVersionsDialog({
  open,
  onClose,
  ...props
}: CodebookVersionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <CodebookVersionsView {...props} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
