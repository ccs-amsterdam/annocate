import { useState } from "react";
import { RotateCcw, UserX } from "lucide-react";
import type { CoderProgress, DeleteCoders } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCoderDeletionMutations, useCoderDeletionsQuery, useSessionsQuery } from "../../../admin/queries";
import { InfoTip } from "@/components/ui/info-tip";
import { ResetAnswersDialog, type ResetScope } from "../ResetAnswersDialog";
import { ConfirmDeleteDialog, DeleteByIdDialog, DeletionLog } from "./CoderDeletion";
import { coderName } from "./coderName";
import { SessionsTable } from "./SessionsTable";
import { DeletionRequests } from "./DeletionRequests";

/**
 * The coder sessions, on the Coders page (docs/client.md §7): per session
 * the link, when it started and was last active, how it ended, and the units
 * finished per loop of the live design version; also sessions without a
 * coder id. Requests to delete answers come first (delete now, or later:
 * then they stay marked on the row). Any session's data can be deleted, or
 * its answers reset.
 */
export function SessionsPanel({ client }: { client: ResearcherApi }) {
  const codersQuery = useSessionsQuery(client);
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
          Sessions
          <InfoTip label="About sessions">
            A session is one coder&apos;s run through the study on a device; a coder can have several. Finished units
            count, per loop of the live design, the units where the session answered every question of the loop.
          </InfoTip>
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
  if (loading) return <p className="text-sm text-muted-foreground">Loading sessions...</p>;
  if (table.coders.length === 0)
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No sessions yet. They appear here once coders open a link.
      </p>
    );
  return <SessionsTable {...table} />;
}

/** Most recently active first; coders who never answered last, newest first. */
function sortByActivity(coders: CoderProgress[]): CoderProgress[] {
  const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  return [...coders].sort(
    (a, b) => time(b.lastActive) - time(a.lastActive) || time(b.started) - time(a.started) || b.id - a.id,
  );
}
