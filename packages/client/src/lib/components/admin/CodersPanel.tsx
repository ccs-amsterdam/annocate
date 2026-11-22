import { useState } from "react";
import { RotateCcw, Trash2, UserX } from "lucide-react";
import type { CoderProgress, DeleteCoders } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCoderDeletionMutations, useCoderDeletionsQuery, useCodersQuery } from "../../admin/queries";
import { formatWhen } from "../../admin/format";
import { InfoTip } from "@/components/ui/info-tip";
import { HelpButton } from "../../help/HelpButton";
import { ResetAnswersDialog, type ResetScope } from "./ResetAnswersDialog";
import { ConfirmDeleteDialog, DeleteByIdDialog, DeletionLog } from "./coders/CoderDeletion";
import { coderName } from "./coders/coderName";

/** How a session ended, in words. */
function endedText(ended: CoderProgress["ended"]): string {
  if (!ended) return "–";
  return ended.outcome === "complete" ? "Complete" : ended.outcome === "screenout" ? "Screened out" : "Quit";
}

/**
 * The Coders tab (docs/client.md §7): per coder session the link, when it
 * started and was last active, how it ended, and the units finished per
 * loop of the live design version. Requests to delete answers come first
 * (delete now, or later: then they stay marked on the row). Any coder's
 * data can be deleted, or their answers reset.
 */
export function CodersPanel({ client }: { client: ResearcherApi }) {
  const codersQuery = useCodersQuery(client);
  const coders = sortByActivity(codersQuery.data ?? []);
  // Loops of the live design version (every coder has the same keys)
  const loops = Object.keys(coders[0]?.finished ?? {});
  // The special sets the study has (overlap, gold, practice): units of them each coder finished
  const specials = (["overlap", "gold", "practice"] as const).filter((kind) => coders.some((c) => c.special?.[kind]));
  const requests = coders.filter((c) => c.deletionRequest && !c.deletionRequest.postponedAt);
  const postponed = coders.filter((c) => c.deletionRequest?.postponedAt).length;
  const deletions = useCoderDeletionsQuery(client).data ?? [];
  const { remove, postpone } = useCoderDeletionMutations(client);
  const [deleting, setDeleting] = useState<{ select: DeleteCoders; names: string[] } | null>(null);
  const [byId, setById] = useState(false);
  const [resetting, setResetting] = useState<ResetScope | null>(null);
  const deleteCoder = (c: CoderProgress) => setDeleting({ select: { sessionIds: [c.id] }, names: [coderName(c)] });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-medium">
          Coders
          <InfoTip label="About the counts">
            Finished units count, per loop of the live design, the units where a coder answered every question of the
            loop.
          </InfoTip>
          <HelpButton topic="coders-and-progress" label="Help: following progress" />
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setResetting({ label: "" })}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset answers…
          </Button>
          <Button variant="outline" size="sm" onClick={() => setById(true)}>
            <UserX className="h-3.5 w-3.5" /> Delete a coder&apos;s data…
          </Button>
        </div>
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
                  asked {formatWhen(c.deletionRequest!.at)} · {c.answers} answers
                  {c.linkLabel ? ` · ${c.linkLabel}` : ""}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button size="xs" variant="destructive" onClick={() => deleteCoder(c)}>
                    Delete now
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={postpone.isPending}
                    title="Stop showing this request here. It stays marked on the coder's row until you delete their data."
                    onClick={() => postpone.mutate(c.id)}
                  >
                    Delete later
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {postponed > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {postponed === 1 ? "1 coder's" : `${postponed} coders'`} data still to be deleted (marked &ldquo;deletion
          requested&rdquo; below).
        </p>
      )}

      {codersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading coders...</p>
      ) : coders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No coders yet. Coders appear here once they open a link.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Coder</th>
                <th className="p-2 font-medium">Link</th>
                <th className="p-2 font-medium">Started</th>
                <th className="p-2 font-medium">Last active</th>
                <th className="p-2 text-right font-medium">Answers</th>
                <th className="p-2 font-medium">Ended</th>
                {loops.map((loop) => (
                  <th key={loop} className="p-2 text-right font-medium">
                    Finished in <span className="font-mono">{loop}</span>
                  </th>
                ))}
                {specials.map((kind) => (
                  <th
                    key={kind}
                    className="p-2 text-right font-medium capitalize"
                    title={`Units of the deployed _${kind} set this coder finished`}
                  >
                    {kind}
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
                    {coder.coder || coder.email ? (
                      coderName(coder)
                    ) : (
                      <span className="text-muted-foreground">#{coder.id}</span>
                    )}
                  </td>
                  <td className="p-2 text-muted-foreground">{coder.linkLabel ?? "–"}</td>
                  <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(coder.started)}</td>
                  <td className="p-2 whitespace-nowrap">{formatWhen(coder.lastActive)}</td>
                  <td className="p-2 text-right tabular-nums">{coder.answers}</td>
                  <td
                    className="p-2 whitespace-nowrap text-muted-foreground"
                    title={coder.ended?.item ? `At ${coder.ended.item}` : undefined}
                  >
                    {endedText(coder.ended)}
                    {coder.deletionRequest && (
                      <span
                        className="ml-1 text-xs text-amber-700 dark:text-amber-400"
                        title={`Asked ${formatWhen(coder.deletionRequest.at)}`}
                      >
                        (deletion requested)
                      </span>
                    )}
                  </td>
                  {loops.map((loop) => (
                    <td key={loop} className="p-2 text-right tabular-nums">
                      {coder.finished[loop] ?? 0}
                    </td>
                  ))}
                  {specials.map((kind) => (
                    <td key={kind} className="p-2 text-right tabular-nums">
                      {coder.special?.[kind] ? `${coder.special[kind].done} of ${coder.special[kind].total}` : "–"}
                    </td>
                  ))}
                  <td className="p-2 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Reset ${coderName(coder)}'s answers`}
                      title="Reset this coder's answers"
                      onClick={() => setResetting({ sessionIds: [coder.id], label: coderName(coder) })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${coderName(coder)}'s data`}
                      title="Delete this coder's data"
                      onClick={() => deleteCoder(coder)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deletions.length > 0 && <DeletionLog deletions={deletions} />}

      <ResetAnswersDialog client={client} scope={resetting} onClose={() => setResetting(null)} />
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

/** Most recently active first; coders who never answered last, newest first. */
function sortByActivity(coders: CoderProgress[]): CoderProgress[] {
  const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  return [...coders].sort(
    (a, b) => time(b.lastActive) - time(a.lastActive) || time(b.started) - time(a.started) || b.id - a.id,
  );
}
