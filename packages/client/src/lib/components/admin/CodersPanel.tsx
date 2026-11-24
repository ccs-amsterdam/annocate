import { useState } from "react";
import { RotateCcw, UserX } from "lucide-react";
import type { CoderProgress, DeleteCoders } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCoderDeletionMutations, useCoderDeletionsQuery, useCodersQuery } from "../../admin/queries";
import { InfoTip } from "@/components/ui/info-tip";
import { HelpButton } from "../../help/HelpButton";
import { ResetAnswersDialog, type ResetScope } from "./ResetAnswersDialog";
import { ConfirmDeleteDialog, DeleteByIdDialog, DeletionLog } from "./coders/CoderDeletion";
import { coderName } from "./coders/coderName";
import { CodersTable } from "./coders/CodersTable";
import { DeletionRequests } from "./coders/DeletionRequests";

/**
 * The Coders view on the Results page (docs/client.md §7): per coder session the link, when it
 * started and was last active, how it ended, and the units finished per
 * loop of the live design version. Requests to delete answers come first
 * (delete now, or later: then they stay marked on the row). Any coder's
 * data can be deleted, or their answers reset.
 */
export function CodersPanel({ client }: { client: ResearcherApi }) {
  const codersQuery = useCodersQuery(client);
  const coders = sortByActivity(codersQuery.data ?? []);
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

      <DeletionRequests
        coders={coders}
        postponing={postpone.isPending}
        onDelete={deleteCoder}
        onPostpone={(c) => postpone.mutate(c.id)}
      />

      <CoderSessions
        loading={codersQuery.isLoading}
        coders={coders}
        onReset={(c) => setResetting({ sessionIds: [c.id], label: coderName(c) })}
        onDelete={deleteCoder}
      />

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

/** The sessions as a table; while loading and without any, a line that says so. */
function CoderSessions({
  loading,
  ...table
}: {
  loading: boolean;
  coders: CoderProgress[];
  onReset: (coder: CoderProgress) => void;
  onDelete: (coder: CoderProgress) => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading coders...</p>;
  if (table.coders.length === 0)
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No coders yet. Coders appear here once they open a link.
      </p>
    );
  return <CodersTable {...table} />;
}

/** Most recently active first; coders who never answered last, newest first. */
function sortByActivity(coders: CoderProgress[]): CoderProgress[] {
  const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  return [...coders].sort(
    (a, b) => time(b.lastActive) - time(a.lastActive) || time(b.started) - time(a.started) || b.id - a.id,
  );
}
