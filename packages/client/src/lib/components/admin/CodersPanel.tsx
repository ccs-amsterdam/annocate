import { useState } from "react";
import { Trash2, UserX } from "lucide-react";
import type { CoderProgress, DeleteCoders } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCoderDeletionMutations, useCodersQuery } from "../../admin/queries";
import { formatWhen } from "../../admin/format";
import { HelpButton } from "../../help/HelpButton";

/** How a coder is named in the UI: participant id, email or number. */
const coderName = (c: CoderProgress) => c.participantId ?? c.email ?? `#${c.id}`;

/** How a session ended, in words. */
function endedText(ended: CoderProgress["ended"]): string {
  if (!ended) return "–";
  return ended.outcome === "complete" ? "Complete" : ended.outcome === "screenout" ? "Screened out" : "Quit";
}

/**
 * Coder progress (docs/client.md §7): who started, through which
 * invitation, when they were last active, how their session ended, and how
 * many units they finished per loop of the live codebook. Coders' requests
 * to delete their answers come first, to delete or decline; any coder's
 * data can be deleted (also by participant id or email). Invitations are
 * on their own tab.
 */
export function CodersPanel({ client }: { client: ResearcherApi }) {
  const codersQuery = useCodersQuery(client);
  const coders = sortByActivity(codersQuery.data ?? []);
  // Loops of the live codebook (every coder has the same keys)
  const loops = Object.keys(coders[0]?.finished ?? {});
  const requests = coders.filter((c) => c.deletionRequest && !c.deletionRequest.declinedAt);
  const { remove, decline } = useCoderDeletionMutations(client);
  const [deleting, setDeleting] = useState<{ select: DeleteCoders; names: string[] } | null>(null);
  const [byId, setById] = useState(false);
  const deleteCoder = (c: CoderProgress) => setDeleting({ select: { coderIds: [c.id] }, names: [coderName(c)] });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-medium">
          Coders <HelpButton topic="coders-and-progress" label="Help: following progress" />
        </h2>
        <Button variant="outline" size="sm" onClick={() => setById(true)}>
          <UserX className="h-3.5 w-3.5" /> Delete a coder&apos;s data…
        </Button>
      </div>

      {requests.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            {requests.length === 1 ? "A coder asks" : `${requests.length} coders ask`} to delete their answers
            <HelpButton topic="coders-and-progress#deleting-a-coders-data" label="Help: deleting a coder's data" />
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {requests.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{coderName(c)}</span>
                <span className="text-xs text-muted-foreground">
                  asked {formatWhen(c.deletionRequest!.at)} · {c.answers} answers{c.inviteLabel ? ` · ${c.inviteLabel}` : ""}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button size="xs" variant="destructive" onClick={() => deleteCoder(c)}>
                    Delete their data
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={decline.isPending}
                    onClick={() => {
                      if (confirm(`Decline ${coderName(c)}'s request? Their answers stay; the request stays on record as declined.`)) decline.mutate(c.id);
                    }}
                  >
                    Decline
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        Finished units count, per loop of the live codebook, the units where a coder answered every question of the
        loop.
      </p>

      {codersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading coders...</p>
      ) : coders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No coders yet. Coders appear here once they open an invitation link.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Coder</th>
                <th className="p-2 font-medium">Invitation</th>
                <th className="p-2 font-medium">Started</th>
                <th className="p-2 font-medium">Last active</th>
                <th className="p-2 text-right font-medium">Answers</th>
                <th className="p-2 font-medium">Ended</th>
                {loops.map((loop) => (
                  <th key={loop} className="p-2 text-right font-medium">
                    Finished in <span className="font-mono">{loop}</span>
                  </th>
                ))}
                <th className="p-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {coders.map((coder) => (
                <tr key={coder.id} className="border-b last:border-0">
                  <td className="p-2">
                    {coder.participantId || coder.email ? coderName(coder) : <span className="text-muted-foreground">#{coder.id}</span>}
                  </td>
                  <td className="p-2 text-muted-foreground">{coder.inviteLabel ?? "–"}</td>
                  <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(coder.started)}</td>
                  <td className="p-2 whitespace-nowrap">{formatWhen(coder.lastActive)}</td>
                  <td className="p-2 text-right tabular-nums">{coder.answers}</td>
                  <td
                    className="p-2 whitespace-nowrap text-muted-foreground"
                    title={coder.ended?.item ? `At ${coder.ended.item}` : undefined}
                  >
                    {endedText(coder.ended)}
                    {coder.deletionRequest && (
                      <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">
                        {coder.deletionRequest.declinedAt ? "(deletion declined)" : "(asks deletion)"}
                      </span>
                    )}
                  </td>
                  {loops.map((loop) => (
                    <td key={loop} className="p-2 text-right tabular-nums">
                      {coder.finished[loop] ?? 0}
                    </td>
                  ))}
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${coderName(coder)}'s data`} title="Delete this coder's data" onClick={() => deleteCoder(coder)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DeleteByIdDialog
        open={byId}
        coders={coders}
        onClose={() => setById(false)}
        onFound={(select, names) => {
          setById(false);
          setDeleting({ select, names });
        }}
      />
      <ConfirmDeleteDialog
        target={deleting}
        busy={remove.isPending}
        error={remove.error instanceof Error ? remove.error.message : null}
        onClose={() => {
          remove.reset();
          setDeleting(null);
        }}
        onConfirm={() => remove.mutate(deleting!.select, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

/** Finds coders by participant id or email (one per line), for deleting their data. */
function DeleteByIdDialog({
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
  const matches = coders.filter((c) => wanted.some((w) => w === c.participantId || w.toLowerCase() === c.email?.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete a coder&apos;s data</DialogTitle>
          <DialogDescription>For instance when a participant withdraws. Give their participant id or email, one per line.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={"P12345\nname@example.org"} className="font-mono text-xs" />
        <p className="text-xs text-muted-foreground">
          {wanted.length === 0
            ? "A participant id can belong to several sessions (e.g. on two devices): all are found."
            : matches.length === 0
              ? "No coder of this job has these ids."
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
              onFound({ coderIds: matches.map((c) => c.id) }, matches.map(coderName));
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
function ConfirmDeleteDialog({
  target,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  target: { select: DeleteCoders; names: string[] } | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {target && target.names.length === 1 ? `${target.names[0]}'s` : "these coders'"} data?</DialogTitle>
          <DialogDescription>This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {target && target.names.length > 1 && <p className="font-medium">{target.names.join(", ")}</p>}
          <p>
            Deletes the coder and all their answers from AnnoTinder, also answers that were reset, and their request to delete,
            if they made one. Copies you downloaded before are not affected: delete those yourself.
          </p>
          <p className="text-muted-foreground">Units they coded can be handed out again where the distribution needs more codings.</p>
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

/** Most recently active first; coders who never answered last, newest first. */
function sortByActivity(coders: CoderProgress[]): CoderProgress[] {
  const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  return [...coders].sort(
    (a, b) => time(b.lastActive) - time(a.lastActive) || time(b.started) - time(a.started) || b.id - a.id,
  );
}
