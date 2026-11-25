import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { CoderKind } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCoderDeletionMutations, useCodersQuery } from "../../../admin/queries";
import { unusedExperts, unusedExpertsText } from "../../../admin/whoCodes";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "./CoderDeletion";

/**
 * Says that the study has expert coders its design doesn't use (`kind`: who
 * codes in the design, a crowd or not chosen yet), so they are never out of
 * sight, and offers to delete them (after confirming).
 */
export function UnusedExpertsNotice({ client, kind }: { client: ResearcherApi; kind: CoderKind | null }) {
  const experts = unusedExperts(useCodersQuery(client).data?.coders ?? [], kind);
  const text = unusedExpertsText(experts);
  const [confirming, setConfirming] = useState(false);
  const { remove } = useCoderDeletionMutations(client);
  if (text === null) return null;
  const select = { coders: experts.map((c) => c.coder) };
  const close = () => {
    remove.reset();
    setConfirming(false);
  };
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>{text}.</span>
      <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setConfirming(true)}>
        Delete them
      </Button>
      <ConfirmDeleteDialog
        target={confirming ? { select, names: select.coders, expert: true } : null}
        busy={remove.isPending}
        error={remove.error instanceof Error ? remove.error.message : null}
        onClose={close}
        onConfirm={() => remove.mutate(select, { onSuccess: close })}
      />
    </div>
  );
}
