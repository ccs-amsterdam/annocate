import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deletionError } from "../../admin/confirmDeletion";

/**
 * Asks to confirm a deletion that can't be undone by typing what goes (a
 * study's name, an account's email address): Delete works once `confirmed`
 * says the typed text is it. `children` say what is deleted. `onDelete`
 * deletes (the typed text is the request's `confirm`); when it fails, its
 * error shows here.
 */
export function ConfirmDeletionDialog({
  title,
  expected,
  confirmed,
  onDelete,
  onClose,
  children,
}: {
  title: string;
  /** What to type, as shown to the user. */
  expected: string;
  confirmed: (typed: string) => boolean;
  onDelete: (typed: string) => Promise<void>;
  onClose: () => void;
  children: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onDelete(typed.trim());
    } catch (e) {
      setError(deletionError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">{children}</div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span>
              To confirm, type <strong className="break-all text-foreground select-all">{expected}</strong>
            </span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </label>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || !confirmed(typed)}>
              {busy ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
