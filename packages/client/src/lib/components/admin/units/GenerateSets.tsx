import { useState } from "react";
import { Scissors } from "lucide-react";
import type { SetGroupResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useUnitsQuery } from "../../../admin/queries";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SplitIntoSets } from "./SplitIntoSets";

/**
 * "Generate sets…" where a codebook picks a group or set: splits all units
 * into a new group in a dialog (as on the Units page), and hands back the
 * new group's name.
 */
export function GenerateSets({ client, groups, onCreated }: { client: ResearcherApi; groups: SetGroupResponse[]; onCreated: (group: string) => void }) {
  const [open, setOpen] = useState(false);
  const units = useUnitsQuery(client).data ?? [];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit cursor-pointer items-center gap-1 text-[11px] font-normal text-muted-foreground hover:text-foreground"
      >
        <Scissors className="h-3 w-3" /> Generate sets…
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Generate sets</DialogTitle>
            <DialogDescription>Split the job&apos;s units into a new group of sets, optionally with overlap units.</DialogDescription>
          </DialogHeader>
          {units.length === 0 ? (
            <p className="text-sm text-muted-foreground">This job has no units yet: upload them on the Units page first.</p>
          ) : (
            <SplitIntoSets
              client={client}
              source={null}
              unitIds={units.map((u) => u.id)}
              groups={groups}
              onDone={(group) => {
                setOpen(false);
                if (group) onCreated(group);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
