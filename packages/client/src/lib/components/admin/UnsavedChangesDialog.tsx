import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface UnsavedChangesDialogProps {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  /** Why saving failed, e.g. validation issues. */
  error?: string | null;
}

/** Asks before leaving unsaved design edits: stay (Cancel), discard them, or save them, then go on. */
export function UnsavedChangesDialog({
  open,
  onCancel,
  onDiscard,
  onSave,
  isSaving,
  error,
}: UnsavedChangesDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-md animate-in flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl duration-150 zoom-in-95 fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Unsaved Changes</h3>
            <p className="text-xs text-muted-foreground">You have unsaved changes in your design.</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-foreground/80">
          If you navigate away without saving, your modifications will be permanently lost. What would you like to do?
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col items-center justify-end gap-2 pt-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onDiscard}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Discard changes
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="w-full bg-primary font-semibold text-primary-foreground sm:w-auto"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
