import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import type { CoderKind, CoderResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { DEFAULT_CODER_SORT, codersOfKind, linkOfCoder, sortCoders, type CoderSort } from "../../../admin/codersTable";
import {
  useCoderDeletionMutations,
  useCodersQuery,
  useLinksQuery,
  useSetGroupsQuery,
  useStudyQuery,
  useWhoCodes,
} from "../../../admin/queries";
import { HelpButton } from "../../../help/HelpButton";
import { Button } from "@/components/ui/button";
import { CoderSetDialog } from "../session/CoderSetDialog";
import { AddCodersDialog } from "./AddCodersDialog";
import { CoderActions } from "./CoderActions";
import { ConfirmDeleteDialog } from "./CoderDeletion";
import { CodersTable } from "./CodersTable";
import { EditEmailDialog } from "./EditEmailDialog";
import { SessionsPanel } from "./SessionsPanel";
import { UnassignedNotice } from "./UnassignedNotice";
import { UnusedExpertsNotice } from "./UnusedExpertsNotice";
import { useHandOver } from "./useHandOver";

/** What is open on top of the page. */
type Open = { dialog: "add" | "set" } | { dialog: "email" | "delete"; coder: CoderResponse } | null;

/**
 * The Coders page (docs/client.md §7, "Coders"): the study's coders of the
 * kind that codes (`useWhoCodes`: the draft design's before the first
 * deploy, the study's fixed kind after), with their units and progress;
 * adding expert coders, dividing the units over them, and deleting a
 * coder. Expert coders the design doesn't use are never out of sight
 * (`UnusedExpertsNotice`). Below it, the coder sessions.
 */
export function CodersPage({ client }: { client: ResearcherApi }) {
  const who = useWhoCodes(client);
  const kind = who?.kind;
  const codersQuery = useCodersQuery(client, { poll: true });
  const all = codersQuery.data?.coders ?? [];
  const groups = useSetGroupsQuery(client).data ?? [];
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <section data-guide="coders-table" className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-lg font-medium">
            Coders <HelpButton topic="coders-and-progress" label="Help: coders" />
          </h2>
          {kind === "expert" && (
            <div className="flex gap-2">
              <Button
                data-guide="add-coders"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setOpen({ dialog: "add" })}
              >
                <UserPlus className="h-3.5 w-3.5" /> Add coders
              </Button>
              <Button
                data-guide="make-coder-set"
                size="sm"
                className="gap-1.5"
                onClick={() => setOpen({ dialog: "set" })}
              >
                <Users className="h-3.5 w-3.5" /> Make coder set
              </Button>
            </div>
          )}
        </header>
        <UnassignedNotice client={client} />
        {who && who.kind !== "expert" && <UnusedExpertsNotice client={client} kind={who.kind} />}
        {kind === null ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Who codes isn&apos;t chosen yet: choose expert coders or a crowd in the design (Who codes). The coders
            appear here.
          </p>
        ) : kind && !codersQuery.isLoading ? (
          <KindCoders
            client={client}
            kind={kind}
            coders={codersOfKind(all, kind)}
            onEditEmail={(coder) => setOpen({ dialog: "email", coder })}
            onDelete={(coder) => setOpen({ dialog: "delete", coder })}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading coders…</p>
        )}
      </section>

      <SessionsPanel client={client} />

      {open?.dialog === "add" && <AddCodersDialog client={client} existing={all} onClose={close} />}
      {open?.dialog === "set" && <CoderSetDialog client={client} groups={groups} onDone={close} />}
      {open?.dialog === "email" && <EditEmailDialog client={client} coder={open.coder} onClose={close} />}
      <DeleteCoder client={client} coder={open?.dialog === "delete" ? open.coder : null} onClose={close} />
    </div>
  );
}

const NO_CODERS: Record<CoderKind, string> = {
  expert: "No expert coders yet. Add coders, then divide the units over them (Make coder set).",
  crowd:
    "No coders yet. A crowd's coders appear here when they start with a coder id (from their link); sessions without one are under Sessions.",
};

/** The coders of one kind as a sortable table, with each row's actions. */
function KindCoders({
  client,
  kind,
  coders,
  onEditEmail,
  onDelete,
}: {
  client: ResearcherApi;
  kind: CoderKind;
  coders: CoderResponse[];
  onEditEmail: (coder: CoderResponse) => void;
  onDelete: (coder: CoderResponse) => void;
}) {
  const [sort, setSort] = useState<CoderSort>(DEFAULT_CODER_SORT);
  const links = useLinksQuery(client).data ?? [];
  const publicId = useStudyQuery(client).data?.publicId ?? "";
  const { movable, handOver, error } = useHandOver(client);
  if (coders.length === 0)
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{NO_CODERS[kind]}</p>
    );
  return (
    <>
      <CodersTable
        kind={kind}
        coders={sortCoders(coders, sort)}
        sort={sort}
        onSort={setSort}
        actions={(coder) => (
          <CoderActions
            coder={coder}
            publicId={publicId}
            link={linkOfCoder(links, coder.coder)}
            movable={movable(coder.coder)}
            onEditEmail={() => onEditEmail(coder)}
            onHandOver={() => handOver(coder.coder)}
            onDelete={() => onDelete(coder)}
          />
        )}
      />
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </>
  );
}

/** Deleting a coder for good, after confirming. */
function DeleteCoder({
  client,
  coder,
  onClose,
}: {
  client: ResearcherApi;
  coder: CoderResponse | null;
  onClose: () => void;
}) {
  const { remove } = useCoderDeletionMutations(client);
  const select = coder ? { coders: [coder.coder] } : null;
  return (
    <ConfirmDeleteDialog
      target={coder && select ? { select, names: [coder.coder], expert: coder.kind === "expert" } : null}
      busy={remove.isPending}
      error={remove.error instanceof Error ? remove.error.message : null}
      onClose={() => {
        remove.reset();
        onClose();
      }}
      onConfirm={() => select && remove.mutate(select, { onSuccess: onClose })}
    />
  );
}
