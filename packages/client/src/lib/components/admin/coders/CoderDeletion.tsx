import { useState } from "react";
import type { CoderDeletion, CoderProgress, DeleteCoders } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatWhen } from "../../../admin/format";
import { coderName } from "./coderName";

// Deleting coders' data (docs/coder-identity.md §8), from the Coders page:
// finding coders by id or email, confirming, and the log of deleted coders.

/**
 * Coders whose data was deleted: kept with the ids downloaded results use,
 * so they can be deleted there too (also in the download, deleted_coders.csv).
 */
export function DeletionLog({ deletions }: { deletions: CoderDeletion[] }) {
  return (
    <details className="mt-2 rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Deleted coders ({deletions.length})
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          delete them from data you downloaded earlier too
        </span>
      </summary>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="p-1.5 font-medium">Coder</th>
            <th className="p-1.5 font-medium">Coder id</th>
            <th className="p-1.5 font-medium">Asked</th>
            <th className="p-1.5 font-medium">Deleted</th>
            <th className="p-1.5 font-medium">By</th>
            <th className="p-1.5 text-right font-medium">Answers</th>
          </tr>
        </thead>
        <tbody>
          {deletions.map((d) => (
            <tr key={`${d.sessionId}-${String(d.deletedAt)}`} className="border-b last:border-0">
              <td className="p-1.5">#{d.sessionId}</td>
              <td className="p-1.5">{d.coder ?? "–"}</td>
              <td className="p-1.5 whitespace-nowrap text-muted-foreground">
                {d.requestedAt ? formatWhen(d.requestedAt) : "–"}
              </td>
              <td className="p-1.5 whitespace-nowrap">{formatWhen(d.deletedAt)}</td>
              <td className="p-1.5 text-muted-foreground">{d.deletedBy ?? "–"}</td>
              <td className="p-1.5 text-right tabular-nums">{d.answers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Finds coders by coder id or email (one per line), for deleting their data. */
export function DeleteByIdDialog({
  open,
  coders,
  onClose,
  onFound,
}: {
  open: boolean;
  coders: CoderProgress[];
  onClose: () => void;
  onFound: (select: DeleteCoders, names: string[]) => void;
}) {
  const [text, setText] = useState("");
  const wanted = text
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const matches = coders.filter((c) => wanted.some((w) => w === c.coder || w.toLowerCase() === c.email?.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete a coder&apos;s data</DialogTitle>
          <DialogDescription>
            For instance when a coder withdraws. Give their coder id or email, one per line.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"P12345\nname@example.org"}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {wanted.length === 0
            ? "A coder id can belong to several sessions (e.g. on two devices): all are found."
            : matches.length === 0
              ? "No coder of this study has these ids."
              : `Found: ${matches.map(coderName).join(", ")} (${matches.length} session${matches.length === 1 ? "" : "s"})`}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={matches.length === 0}
            onClick={() => {
              onFound({ sessionIds: matches.map((c) => c.id) }, matches.map(coderName));
              setText("");
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The last step before deleting coders' data for good. */
export function ConfirmDeleteDialog({
  target,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  /** `expert`: an expert coder is deleted, who leaves the coder set too. */
  target: { select: DeleteCoders; names: string[]; expert?: boolean } | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Delete {target && target.names.length === 1 ? `${target.names[0]}'s` : "these coders'"} data?
          </DialogTitle>
          <DialogDescription>This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {target && target.names.length > 1 && <p className="font-medium">{target.names.join(", ")}</p>}
          <p>
            Deletes the coder and all their answers from AnnoTinder, also answers that were reset. Copies you downloaded
            before are not affected: delete those yourself. The deletion is logged (Deleted coders, below, and
            deleted_coders.csv in the download) with the session id and coder id, so you can.
          </p>
          {target?.expert ? (
            <p className="text-muted-foreground">
              The coder leaves the coder set, deployed and in the draft, and their link is deleted: their units have no
              coder until you divide them again (Make coder set) and deploy the units. The coder id can be added again
              afterwards: a new coder, who gets a new link when the units are deployed.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Units they coded can be handed out again where the distribution needs more codings.
            </p>
          )}
          {error && <p className="text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            Delete for good
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
